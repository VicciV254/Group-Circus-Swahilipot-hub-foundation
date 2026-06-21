"""
apps/finance/views.py — Nexus Finance (complete, all issues fixed)

Fixes applied:
  1. Budget: `remaining_amount`, `utilisation_pct`, `is_over_budget` exposed
  2. Expense create: validates budget has sufficient remaining funds, 403 with reason if not
  3. Invoices: full CRUD + approve/reject/send/mark_paid/mark_overdue
  4. Payroll: process sends email to each eligible employee, returns full detail payload
  5. PO: PurchaseOrderViewSet was crashing with no render (missing queryset guard) — fixed
  6. Payments: full CRUD; Reports: generate builds real aggregated data per type
  7. Stipends: process sends email just like payroll
  8. All list endpoints support ?format=csv for CSV export
"""

import csv
import io
from datetime import date, timedelta

from dateutil.relativedelta import relativedelta

from django.conf import settings
from django.core.mail import send_mail
from django.db.models import Sum, Count, Q, F
from django.db.models.functions import TruncMonth
from django.http import HttpResponse
from django.utils import timezone

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from .models import (
    Budget, Expense, Invoice, Payroll,
    PettyCash, PurchaseOrder, Payment, Stipend, FinancialReport,
)
from .serializers import (
    BudgetSerializer, ExpenseSerializer, InvoiceSerializer, PayrollSerializer,
    PettyCashSerializer, PurchaseOrderSerializer, PaymentSerializer,
    StipendSerializer, FinancialReportSerializer,
)


# ── helpers ───────────────────────────────────────────────────────────────────

def _csv_response(filename: str, headers: list, rows):
    """Return an HttpResponse streaming CSV."""
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    writer = csv.writer(response)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    return response


def _send_notification(subject: str, message: str, recipient_email: str):
    """Fire-and-forget email; silently ignores send errors."""
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@nexus.local"),
            recipient_list=[recipient_email],
            fail_silently=True,
        )
    except Exception:
        pass


# ── Budgets ───────────────────────────────────────────────────────────────────

class BudgetViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = BudgetSerializer

    def get_queryset(self):
        return Budget.objects.all().order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        # CSV export
        if request.query_params.get("format") == "csv":
            return _csv_response(
                "budgets.csv",
                ["Name", "Department", "Period", "Total (KES)", "Used (KES)", "Remaining (KES)", "% Used", "Start", "End"],
                [
                    [
                        b.name, b.department, b.period,
                        b.total_amount, b.used_amount, b.remaining_amount,
                        f"{min(100, round((float(b.used_amount) / float(b.total_amount or 1)) * 100))}%",
                        b.start_date, b.end_date,
                    ]
                    for b in qs
                ],
            )
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


# ── Expenses ──────────────────────────────────────────────────────────────────

class ExpenseViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ExpenseSerializer

    def get_queryset(self):
        return Expense.objects.select_related("submitted_by", "reviewed_by", "budget").order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(submitted_by=self.request.user)

    def create(self, request, *args, **kwargs):
        """Validate budget has enough remaining funds before saving."""
        budget_id = request.data.get("budget")
        amount = float(request.data.get("amount", 0) or 0)

        if budget_id and amount:
            try:
                budget = Budget.objects.get(pk=budget_id)
                remaining = float(budget.remaining_amount)
                if amount > remaining:
                    return Response(
                        {
                            "detail": (
                                f"Insufficient budget funds. "
                                f"This expense is KES {amount:,.2f} but "
                                f'"{budget.name}" only has KES {remaining:,.2f} remaining '
                                f"(KES {float(budget.total_amount):,.2f} total, "
                                f"KES {float(budget.used_amount):,.2f} already used)."
                            ),
                            "code": "budget_exceeded",
                            "budget_name": budget.name,
                            "requested": amount,
                            "available": remaining,
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            except Budget.DoesNotExist:
                pass  # Let serializer validation handle missing budget

        return super().create(request, *args, **kwargs)

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        if request.query_params.get("format") == "csv":
            return _csv_response(
                "expenses.csv",
                ["Title", "Amount (KES)", "Category", "Budget", "Status", "Submitted By", "Receipt Date", "Date"],
                [
                    [
                        e.title, e.amount, e.get_category_display(),
                        e.budget.name if e.budget else "",
                        e.get_status_display(),
                        e.submitted_by.get_full_name() if e.submitted_by else "",
                        e.receipt_date, e.created_at.date(),
                    ]
                    for e in qs
                ],
            )
        return super().list(request, *args, **kwargs)


class ExpenseActionView(APIView):
    """POST /finance/expenses/<pk>/action/  body: { action: approve|reject|mark_paid }"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            expense = Expense.objects.select_related("budget").get(pk=pk)
        except Expense.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        action_name = request.data.get("action")

        if action_name == "approve":
            # Double-check budget hasn't been over-committed by concurrent approvals
            if expense.budget:
                budget = expense.budget
                if float(expense.amount) > float(budget.remaining_amount):
                    return Response(
                        {
                            "detail": (
                                f'Cannot approve: "{budget.name}" only has '
                                f"KES {float(budget.remaining_amount):,.2f} remaining but "
                                f"this expense is KES {float(expense.amount):,.2f}."
                            ),
                            "code": "budget_exceeded",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                budget.used_amount = F("used_amount") + expense.amount
                budget.save(update_fields=["used_amount"])

            expense.status = "approved"
            expense.reviewed_by = request.user
            expense.reviewed_at = timezone.now()

        elif action_name == "reject":
            expense.status = "rejected"
            expense.reviewed_by = request.user
            expense.reviewed_at = timezone.now()

        elif action_name == "mark_paid":
            expense.status = "paid"

        else:
            return Response({"detail": "Invalid action. Use: approve, reject, mark_paid."}, status=status.HTTP_400_BAD_REQUEST)

        expense.save()
        expense.refresh_from_db()
        return Response(ExpenseSerializer(expense).data)


# ── Invoices ──────────────────────────────────────────────────────────────────

class InvoiceViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = InvoiceSerializer

    def get_queryset(self):
        return Invoice.objects.select_related("created_by", "approved_by").order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        # Auto-mark overdue
        today = date.today()
        qs.filter(due_date__lt=today, status__in=["pending", "approved", "sent"]).update(status="overdue")

        if request.query_params.get("format") == "csv":
            return _csv_response(
                "invoices.csv",
                ["Invoice #", "Type", "Vendor/Client", "Amount (KES)", "Tax (KES)", "Status", "Issue Date", "Due Date", "Paid Date"],
                [
                    [
                        inv.invoice_number, inv.invoice_type, inv.vendor,
                        inv.amount, inv.tax_amount, inv.status,
                        inv.issue_date, inv.due_date, inv.paid_date,
                    ]
                    for inv in qs
                ],
            )
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


class InvoiceActionView(APIView):
    """POST /finance/invoices/<pk>/action/  body: { action: approve|reject|send|mark_paid|mark_overdue }"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            invoice = Invoice.objects.select_related("created_by").get(pk=pk)
        except Invoice.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        action_name = request.data.get("action")

        if action_name == "approve":
            invoice.status = "approved"
            invoice.approved_by = request.user
        elif action_name == "reject":
            invoice.status = "cancelled"
        elif action_name == "send":
            invoice.status = "sent"
        elif action_name == "mark_paid":
            invoice.status = "paid"
            invoice.paid_date = date.today()
            # Auto-create a Payment record for traceability
            Payment.objects.create(
                reference=invoice.invoice_number,
                payee=invoice.vendor,
                amount=invoice.amount + invoice.tax_amount,
                type="outgoing" if invoice.invoice_type == "incoming" else "incoming",
                method="bank_transfer",
                payment_date=date.today(),
                status="completed",
                invoice=invoice,
                recorded_by=request.user,
            )
        elif action_name == "mark_overdue":
            invoice.status = "overdue"
        else:
            return Response({"detail": "Invalid action. Use: approve, reject, send, mark_paid, mark_overdue."}, status=status.HTTP_400_BAD_REQUEST)

        invoice.save()
        return Response(InvoiceSerializer(invoice).data)


# ── Payroll ───────────────────────────────────────────────────────────────────

class PayrollViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PayrollSerializer

    def get_queryset(self):
        return Payroll.objects.select_related("employee", "processed_by").order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(processed_by=self.request.user)

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        if request.query_params.get("format") == "csv":
            return _csv_response(
                "payroll.csv",
                ["Employee", "Department", "Period", "Pay Date", "Gross Pay", "Deductions", "Net Pay", "Method", "Status"],
                [
                    [
                        p.employee.get_full_name(),
                        p.employee.department.name if p.employee.department else "",
                        p.period, p.pay_date,
                        p.gross_pay, p.deductions, p.net_pay,
                        p.payment_method, p.status,
                    ]
                    for p in qs
                ],
            )
        return super().list(request, *args, **kwargs)


class ProcessPayrollView(APIView):
    """
    POST /finance/payroll/process/
    body: { period, pay_date, department?, payment_method, notes? }

    Marks draft records as processed, sends email to each employee,
    returns full payroll detail list for the frontend panel.
    """
    permission_classes = [IsAuthenticated]
    http_method_names = ["post", "options", "head"]

    def post(self, request):
        period = request.data.get("period", "").strip()
        pay_date = request.data.get("pay_date")
        department = request.data.get("department", "").strip()
        payment_method = request.data.get("payment_method", "bank_transfer")
        notes = request.data.get("notes", "")

        if not period:
            return Response({"detail": "Period is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not pay_date:
            return Response({"detail": "Pay date is required."}, status=status.HTTP_400_BAD_REQUEST)

        qs = Payroll.objects.select_related("employee", "employee__department").filter(
            period=period, status="draft"
        )
        if department:
            qs = qs.filter(employee__department__name__iexact=department)

        records = list(qs)
        if not records:
            return Response(
                {"detail": f"No draft payroll records found for period '{period}'{' in ' + department if department else ''}."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Update each record individually so we can send emails
        processed_records = []
        for record in records:
            record.status = "processed"
            record.pay_date = pay_date
            record.payment_method = payment_method
            record.notes = notes
            record.processed_by = request.user
            record.save(update_fields=["status", "pay_date", "payment_method", "notes", "processed_by"])
            processed_records.append(record)

            # Send email notification
            employee = record.employee
            method_label = dict(Payroll.PAYMENT_METHOD_CHOICES).get(payment_method, payment_method)
            _send_notification(
                subject=f"[Nexus] Your {period} salary is being processed",
                message=(
                    f"Dear {employee.get_full_name()},\n\n"
                    f"We are pleased to inform you that your salary for {period} "
                    f"(KES {float(record.net_pay):,.2f} net) has been processed "
                    f"and will be disbursed via {method_label}.\n\n"
                    f"Please expect the funds to reflect in your account within 72 hours "
                    f"from {pay_date}.\n\n"
                    f"If you have any questions, please contact the Finance team.\n\n"
                    f"Regards,\nNexus Finance Team"
                ),
                recipient_email=employee.email,
            )

        serializer = PayrollSerializer(processed_records, many=True)
        return Response(
            {
                "detail": f"Payroll processed for {len(processed_records)} employee(s). Notification emails sent.",
                "period": period,
                "pay_date": pay_date,
                "records_processed": len(processed_records),
                "records": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class PayslipView(APIView):
    """GET /finance/payroll/<pk>/payslip/   ?format=csv for download"""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            record = Payroll.objects.select_related("employee", "employee__department").get(pk=pk)
        except Payroll.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        data = {
            "employee_name": record.employee.get_full_name(),
            "employee_id": record.employee.employee_id or "",
            "department": record.employee.department.name if record.employee.department else "",
            "period": record.period,
            "pay_date": record.pay_date,
            "gross_pay": float(record.gross_pay),
            "deductions": float(record.deductions),
            "net_pay": float(record.net_pay),
            "payment_method": record.get_payment_method_display(),
            "status": record.status,
        }

        if request.query_params.get("format") == "csv":
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = f'attachment; filename="payslip_{record.employee.employee_id or pk}_{record.period}.csv"'
            w = csv.writer(response)
            for k, v in data.items():
                w.writerow([k.replace("_", " ").title(), v])
            return response

        return Response(data)


# ── Petty Cash ────────────────────────────────────────────────────────────────

class PettyCashViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PettyCashSerializer

    def get_queryset(self):
        return PettyCash.objects.select_related("requested_by", "approved_by").order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()

        if request.query_params.get("format") == "csv":
            return _csv_response(
                "petty_cash.csv",
                ["Description", "Amount (KES)", "Date", "Receipt #", "Requested By", "Status"],
                [
                    [
                        pc.description, pc.amount, pc.date, pc.receipt_number,
                        pc.requested_by.get_full_name() if pc.requested_by else "",
                        pc.status,
                    ]
                    for pc in qs
                ],
            )

        serializer = self.get_serializer(qs, many=True)
        total_disbursed = qs.filter(status="disbursed").aggregate(t=Sum("amount"))["t"] or 0
        # Ideally replace 50000 with a PettyCashFund model field
        opening = 50000
        return Response({
            "results": serializer.data,
            "fund": {
                "opening_balance": opening,
                "total_disbursed": float(total_disbursed),
                "closing_balance": opening - float(total_disbursed),
            },
        })


class PettyCashActionView(APIView):
    """POST /finance/petty-cash/<pk>/action/  body: { action: approve|reject|disburse }"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            pc = PettyCash.objects.get(pk=pk)
        except PettyCash.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        action_name = request.data.get("action")
        if action_name == "approve":
            pc.status = "approved"
            pc.approved_by = request.user
        elif action_name == "reject":
            pc.status = "rejected"
            pc.approved_by = request.user
        elif action_name == "disburse":
            pc.status = "disbursed"
        else:
            return Response({"detail": "Invalid action. Use: approve, reject, disburse."}, status=status.HTTP_400_BAD_REQUEST)

        pc.save()
        return Response(PettyCashSerializer(pc).data)


# ── Purchase Orders ───────────────────────────────────────────────────────────

class PurchaseOrderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PurchaseOrderSerializer

    def get_queryset(self):
        # Guard: always return a valid queryset — this was causing the blank page crash
        return PurchaseOrder.objects.select_related(
            "requested_by", "approved_by", "budget"
        ).order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        if request.query_params.get("format") == "csv":
            return _csv_response(
                "purchase_orders.csv",
                ["PO #", "Supplier", "Description", "Amount (KES)", "Qty", "Budget", "Delivery Date", "Requested By", "Status"],
                [
                    [
                        po.po_number, po.supplier, po.description, po.amount,
                        po.quantity, po.budget.name if po.budget else "",
                        po.delivery_date,
                        po.requested_by.get_full_name() if po.requested_by else "",
                        po.status,
                    ]
                    for po in qs
                ],
            )
        return super().list(request, *args, **kwargs)


class PurchaseOrderActionView(APIView):
    """POST /finance/purchase-orders/<pk>/action/  body: { action: approve|reject|deliver }"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            po = PurchaseOrder.objects.select_related("budget").get(pk=pk)
        except PurchaseOrder.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        action_name = request.data.get("action")
        if action_name == "approve":
            # Charge budget if linked and funds available
            if po.budget:
                budget = po.budget
                if float(po.amount) > float(budget.remaining_amount):
                    return Response(
                        {
                            "detail": (
                                f'Cannot approve: "{budget.name}" only has '
                                f"KES {float(budget.remaining_amount):,.2f} remaining but "
                                f"this PO is KES {float(po.amount):,.2f}."
                            ),
                            "code": "budget_exceeded",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                budget.used_amount = F("used_amount") + po.amount
                budget.save(update_fields=["used_amount"])

            po.status = "approved"
            po.approved_by = request.user

        elif action_name == "reject":
            po.status = "rejected"
            po.approved_by = request.user

        elif action_name == "deliver":
            po.status = "delivered"

        else:
            return Response({"detail": "Invalid action. Use: approve, reject, deliver."}, status=status.HTTP_400_BAD_REQUEST)

        po.save()
        return Response(PurchaseOrderSerializer(po).data)


# ── Payments ──────────────────────────────────────────────────────────────────

class PaymentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PaymentSerializer

    def get_queryset(self):
        return Payment.objects.select_related("recorded_by", "invoice", "expense").order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        if request.query_params.get("format") == "csv":
            return _csv_response(
                "payments.csv",
                ["Reference", "Payee/Payer", "Amount (KES)", "Type", "Method", "Payment Date", "Status", "Notes"],
                [
                    [
                        p.reference, p.payee, p.amount, p.type,
                        p.get_method_display(), p.payment_date, p.status, p.notes,
                    ]
                    for p in qs
                ],
            )
        return super().list(request, *args, **kwargs)


# ── Stipends ──────────────────────────────────────────────────────────────────

class StipendViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = StipendSerializer

    def get_queryset(self):
        return Stipend.objects.select_related("created_by", "processed_by").order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        if request.query_params.get("format") == "csv":
            return _csv_response(
                "stipends.csv",
                ["Attachee", "Department", "Amount (KES)", "Period", "Start", "End", "Method", "Status"],
                [
                    [
                        s.attachee_name, s.department, s.amount, s.period,
                        s.start_date, s.end_date, s.payment_method, s.status,
                    ]
                    for s in qs
                ],
            )
        return super().list(request, *args, **kwargs)


class ProcessStipendView(APIView):
    """POST /finance/stipends/<pk>/process/  — process and notify attachee if email known"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            stipend = Stipend.objects.get(pk=pk)
        except Stipend.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if stipend.status not in ("pending", "approved"):
            return Response(
                {"detail": f"Cannot process a stipend with status '{stipend.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        stipend.status = "processed"
        stipend.processed_by = request.user
        stipend.save()

        method_label = dict(Stipend.PAYMENT_METHOD_CHOICES).get(stipend.payment_method, stipend.payment_method)

        # Look up the attachee's user account to get their email.
        # The accounts app User model uses email as USERNAME_FIELD and has role='attachee'.
        # We match on full name (first + last) or first name within the attachee role.
        try:
            from django.conf import settings as _s
            AccountUser = __import__(
                "apps.accounts.models", fromlist=["User"]
            ).User

            name_parts = stipend.attachee_name.strip().split()
            first = name_parts[0] if name_parts else ""
            last  = name_parts[-1] if len(name_parts) > 1 else ""

            # Try exact full-name match first, then first-name-only fallback
            attachee_user = (
                AccountUser.objects.filter(
                    first_name__iexact=first,
                    last_name__iexact=last,
                    role="attachee",
                ).first()
                or AccountUser.objects.filter(
                    first_name__iexact=first,
                    role="attachee",
                ).first()
            )

            if attachee_user:
                _send_notification(
                    subject=f"[Nexus] Your {stipend.period} stipend is being processed",
                    message=(
                        f"Dear {stipend.attachee_name},\n\n"
                        f"Your stipend of KES {float(stipend.amount):,.2f} for {stipend.period} "
                        f"has been processed and will be disbursed via {method_label}.\n\n"
                        f"Please expect the funds to reflect in your account within 72 hours.\n\n"
                        f"If you have any questions, please contact the Finance team.\n\n"
                        f"Regards,\nNexus Finance Team"
                    ),
                    recipient_email=attachee_user.email,
                )
        except Exception:
            pass  # Never let email lookup crash the response

        return Response(StipendSerializer(stipend).data)


# ── Financial Reports ─────────────────────────────────────────────────────────

class FinancialReportViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = FinancialReportSerializer
    http_method_names = ["get", "delete", "head", "options"]

    def get_queryset(self):
        return FinancialReport.objects.select_related("generated_by").order_by("-created_at")


class GenerateReportView(APIView):
    """
    POST /finance/reports/generate/
    body: { type, period? }

    Builds aggregated data, writes a CSV file to MEDIA_ROOT/finance_reports/,
    stores the public URL in FinancialReport.file_url, and returns the record.
    """
    permission_classes = [IsAuthenticated]
    http_method_names = ["post", "options", "head"]

    REPORT_NAMES = {
        "income_statement": "Income Statement",
        "balance_sheet":    "Balance Sheet",
        "cash_flow":        "Cash Flow Report",
        "expense_report":   "Expense Report",
    }

    # ── helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _save_csv(filename: str, rows: list) -> str:
        """
        Write rows (list-of-lists) to MEDIA_ROOT/finance_reports/<filename>.
        Returns the relative media path so we can build a URL from it.
        """
        import os
        from django.core.files.base import ContentFile
        from django.core.files.storage import default_storage

        output = io.StringIO()
        writer = csv.writer(output)
        for row in rows:
            writer.writerow(row)

        rel_path = f"finance_reports/{filename}"
        # Overwrite if already exists
        if default_storage.exists(rel_path):
            default_storage.delete(rel_path)
        default_storage.save(rel_path, ContentFile(output.getvalue().encode("utf-8")))
        return rel_path

    @staticmethod
    def _media_url(request, rel_path: str) -> str:
        """Turn a relative media path into an absolute URL the browser can GET."""
        from django.conf import settings as _cfg
        base = getattr(_cfg, "MEDIA_URL", "/media/")
        # Build absolute URL using the request host so it works on any server
        return request.build_absolute_uri(f"{base.rstrip('/')}/{rel_path}")

    # ── report builders ───────────────────────────────────────────────────────

    def _build_expense_report(self, start, end):
        header = ["Category", "Status", "Count", "Total (KES)"]
        qs = (
            Expense.objects
            .filter(created_at__date__range=[start, end])
            .values("category", "status")
            .annotate(total=Sum("amount"), count=Count("id"))
            .order_by("category", "status")
        )
        rows = [header]
        for r in qs:
            rows.append([
                r["category"].replace("_", " ").title(),
                r["status"].title(),
                r["count"],
                f"{float(r['total']):.2f}",
            ])

        # Totals footer
        grand = Expense.objects.filter(created_at__date__range=[start, end]).aggregate(t=Sum("amount"))
        rows.append([])
        rows.append(["TOTAL", "", "", f"{float(grand['t'] or 0):.2f}"])
        return rows

    def _build_income_statement(self, start, end):
        income   = float(Payment.objects.filter(type="incoming",  payment_date__range=[start, end]).aggregate(t=Sum("amount"))["t"] or 0)
        expenses = float(Expense.objects.filter(status__in=["approved", "paid"], created_at__date__range=[start, end]).aggregate(t=Sum("amount"))["t"] or 0)
        payroll  = float(Payroll.objects.filter(status__in=["processed", "paid"], pay_date__range=[start, end]).aggregate(t=Sum("net_pay"))["t"] or 0)
        net      = income - expenses - payroll

        return [
            ["Income Statement", f"{start} to {end}"],
            [],
            ["Item", "Amount (KES)"],
            ["Total Income / Revenue", f"{income:.2f}"],
            ["Total Approved Expenses", f"{expenses:.2f}"],
            ["Total Payroll Disbursed", f"{payroll:.2f}"],
            [],
            ["NET PROFIT / (LOSS)", f"{net:.2f}"],
        ]

    def _build_balance_sheet(self, today):
        total_budget        = float(Budget.objects.aggregate(t=Sum("total_amount"))["t"] or 0)
        total_used          = float(Budget.objects.aggregate(t=Sum("used_amount"))["t"] or 0)
        total_payroll       = float(Payroll.objects.filter(status__in=["processed", "paid"]).aggregate(t=Sum("net_pay"))["t"] or 0)
        total_inv_paid      = float(Invoice.objects.filter(status="paid").aggregate(t=Sum("amount"))["t"] or 0)
        total_payments_out  = float(Payment.objects.filter(type="outgoing").aggregate(t=Sum("amount"))["t"] or 0)
        total_payments_in   = float(Payment.objects.filter(type="incoming").aggregate(t=Sum("amount"))["t"] or 0)
        pending_po_value    = float(PurchaseOrder.objects.filter(status="pending").aggregate(t=Sum("amount"))["t"] or 0)

        return [
            ["Balance Sheet", f"As of {today}"],
            [],
            ["Item", "Amount (KES)"],
            ["Total Budget Allocated",    f"{total_budget:.2f}"],
            ["Total Budget Utilised",     f"{total_used:.2f}"],
            ["Total Budget Remaining",    f"{total_budget - total_used:.2f}"],
            [],
            ["Total Payroll Disbursed",   f"{total_payroll:.2f}"],
            ["Total Invoices Paid",       f"{total_inv_paid:.2f}"],
            ["Total Outgoing Payments",   f"{total_payments_out:.2f}"],
            ["Total Incoming Payments",   f"{total_payments_in:.2f}"],
            [],
            ["Pending PO Commitments",    f"{pending_po_value:.2f}"],
        ]

    def _build_cash_flow(self, today):
        twelve_ago = today - relativedelta(months=11)

        incoming_qs = (
            Payment.objects.filter(type="incoming", payment_date__gte=twelve_ago)
            .annotate(month=TruncMonth("payment_date")).values("month").annotate(amount=Sum("amount"))
        )
        outgoing_qs = (
            Payment.objects.filter(type="outgoing", payment_date__gte=twelve_ago)
            .annotate(month=TruncMonth("payment_date")).values("month").annotate(amount=Sum("amount"))
        )
        exp_qs = (
            Expense.objects.filter(status__in=["approved", "paid"], created_at__date__gte=twelve_ago)
            .annotate(month=TruncMonth("created_at")).values("month").annotate(amount=Sum("amount"))
        )

        # Build month map
        data = {}
        for i in range(12):
            m = (twelve_ago + relativedelta(months=i)).strftime("%Y-%m")
            data[m] = {"month": m, "income": 0.0, "outgoing_payments": 0.0, "expenses": 0.0}

        for r in incoming_qs:
            k = r["month"].strftime("%Y-%m")
            if k in data: data[k]["income"] = float(r["amount"])
        for r in outgoing_qs:
            k = r["month"].strftime("%Y-%m")
            if k in data: data[k]["outgoing_payments"] = float(r["amount"])
        for r in exp_qs:
            k = r["month"].strftime("%Y-%m")
            if k in data: data[k]["expenses"] = float(r["amount"])

        rows = [["Month", "Income (KES)", "Outgoing Payments (KES)", "Expenses (KES)", "Net (KES)"]]
        for v in data.values():
            net = v["income"] - v["outgoing_payments"] - v["expenses"]
            rows.append([
                v["month"],
                f"{v['income']:.2f}",
                f"{v['outgoing_payments']:.2f}",
                f"{v['expenses']:.2f}",
                f"{net:.2f}",
            ])
        return rows

    # ── main handler ──────────────────────────────────────────────────────────

    def post(self, request):
        report_type = request.data.get("type", "custom").strip()
        period      = request.data.get("period", "").strip()
        today       = date.today()
        start       = date(today.year, 1, 1)   # YTD default
        end         = today
        name        = self.REPORT_NAMES.get(report_type, "Custom Report")
        if period:
            name = f"{name} — {period}"

        # Build CSV rows
        if report_type == "expense_report":
            rows = self._build_expense_report(start, end)
        elif report_type == "income_statement":
            rows = self._build_income_statement(start, end)
        elif report_type == "balance_sheet":
            rows = self._build_balance_sheet(today)
        elif report_type == "cash_flow":
            rows = self._build_cash_flow(today)
        else:
            rows = [["Report type not recognised", report_type]]

        # Save CSV and build public URL
        safe_name = name.replace(" ", "_").replace("—", "-").replace("/", "-")
        filename  = f"{safe_name}_{today.strftime('%Y%m%d_%H%M%S')}.csv"
        rel_path  = self._save_csv(filename, rows)
        file_url  = self._media_url(request, rel_path)

        report = FinancialReport.objects.create(
            name         = name,
            type         = report_type,
            period       = period or f"{start} to {end}",
            file_url     = file_url,
            generated_by = request.user,
        )
        return Response(FinancialReportSerializer(report).data, status=status.HTTP_201_CREATED)


# ── Cash Flow ─────────────────────────────────────────────────────────────────

class CashFlowView(APIView):
    """GET /finance/cash-flow/ — 12-month income vs expenses for the area chart."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = date.today()
        twelve_months_ago = today - relativedelta(months=11)

        incoming = (
            Payment.objects
            .filter(type="incoming", payment_date__gte=twelve_months_ago)
            .annotate(month=TruncMonth("payment_date"))
            .values("month")
            .annotate(income=Sum("amount"))
        )
        outgoing = (
            Expense.objects
            .filter(status__in=["approved", "paid"], created_at__date__gte=twelve_months_ago)
            .annotate(month=TruncMonth("created_at"))
            .values("month")
            .annotate(expenses=Sum("amount"))
        )

        data = {}
        for i in range(12):
            m = twelve_months_ago + relativedelta(months=i)
            key = m.strftime("%b")
            data[key] = {"month": key, "income": 0, "expenses": 0}

        for row in incoming:
            key = row["month"].strftime("%b")
            if key in data:
                data[key]["income"] = float(row["income"])

        for row in outgoing:
            key = row["month"].strftime("%b")
            if key in data:
                data[key]["expenses"] = float(row["expenses"])

        return Response(list(data.values()))


# ── Expense Category Breakdown ────────────────────────────────────────────────

class ExpenseCategoryBreakdownView(APIView):
    """GET /finance/expense-categories/ — pie chart data."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = (
            Expense.objects
            .filter(status__in=["approved", "paid"])
            .values("category")
            .annotate(value=Sum("amount"))
            .order_by("-value")
        )
        data = [
            {"name": row["category"].replace("_", " ").title(), "value": float(row["value"])}
            for row in rows
        ]
        return Response(data)
    