from rest_framework import serializers
from .models import (
    Budget, Expense, Invoice, Payroll,
    PettyCash, PurchaseOrder, Payment, Stipend, FinancialReport,
)


class BudgetSerializer(serializers.ModelSerializer):
    created_by_name   = serializers.CharField(source="created_by.get_full_name", read_only=True)
    remaining_amount  = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    utilisation_pct   = serializers.SerializerMethodField()
    is_over_budget    = serializers.SerializerMethodField()

    class Meta:
        model  = Budget
        fields = [
            "id", "name", "total_amount", "used_amount", "remaining_amount",
            "utilisation_pct", "is_over_budget",
            "period", "department", "start_date", "end_date", "notes",
            "created_by", "created_by_name", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "used_amount", "created_by", "created_at", "updated_at"]

    def get_utilisation_pct(self, obj):
        total = float(obj.total_amount or 1)
        used  = float(obj.used_amount  or 0)
        return min(100, round((used / total) * 100, 1))

    def get_is_over_budget(self, obj):
        return float(obj.used_amount or 0) > float(obj.total_amount or 0)


class ExpenseSerializer(serializers.ModelSerializer):
    submitted_by_name = serializers.CharField(source="submitted_by.get_full_name", read_only=True)
    reviewed_by_name  = serializers.CharField(source="reviewed_by.get_full_name",  read_only=True)
    # Expose budget name so the table can show it without a second request
    budget_name       = serializers.CharField(source="budget.name", read_only=True, default="")

    class Meta:
        model  = Expense
        fields = [
            "id", "title", "description", "amount", "category", "status",
            "budget", "budget_name", "receipt_date",
            "submitted_by", "submitted_by_name",
            "reviewed_by", "reviewed_by_name", "reviewed_at",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "status", "submitted_by", "reviewed_by",
            "reviewed_at", "created_at", "updated_at",
        ]


class InvoiceSerializer(serializers.ModelSerializer):
    created_by_name  = serializers.CharField(source="created_by.get_full_name",  read_only=True)
    approved_by_name = serializers.CharField(source="approved_by.get_full_name", read_only=True)
    total_amount     = serializers.SerializerMethodField()

    class Meta:
        model  = Invoice
        fields = [
            "id", "invoice_number", "invoice_type", "vendor",
            "amount", "tax_amount", "total_amount", "description", "status",
            "issue_date", "due_date", "paid_date",
            "created_by", "created_by_name",
            "approved_by", "approved_by_name",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "invoice_number", "status",
            "created_by", "approved_by", "created_at", "updated_at",
        ]

    def get_total_amount(self, obj):
        return float(obj.amount) + float(obj.tax_amount)


class PayrollSerializer(serializers.ModelSerializer):
    employee_name    = serializers.CharField(source="employee.get_full_name", read_only=True)
    # Fix: employee.department is a FK → Department; name lives on department.name
    department       = serializers.SerializerMethodField()
    processed_by_name= serializers.CharField(source="processed_by.get_full_name", read_only=True)

    class Meta:
        model  = Payroll
        fields = [
            "id", "employee", "employee_name", "department",
            "period", "pay_date", "gross_pay", "deductions", "net_pay",
            "payment_method", "status", "notes",
            "processed_by", "processed_by_name",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "processed_by", "created_at", "updated_at"]

    def get_department(self, obj):
        try:
            return obj.employee.department.name if obj.employee.department else ""
        except Exception:
            return ""


class PettyCashSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.CharField(source="requested_by.get_full_name", read_only=True)
    approved_by_name  = serializers.CharField(source="approved_by.get_full_name",  read_only=True)

    class Meta:
        model  = PettyCash
        fields = [
            "id", "description", "amount", "date", "receipt_number",
            "status", "notes",
            "requested_by", "requested_by_name",
            "approved_by", "approved_by_name",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "status", "requested_by", "approved_by", "created_at", "updated_at",
        ]


class PurchaseOrderSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.CharField(source="requested_by.get_full_name", read_only=True)
    approved_by_name  = serializers.CharField(source="approved_by.get_full_name",  read_only=True)
    budget_name       = serializers.CharField(source="budget.name", read_only=True, default="")

    class Meta:
        model  = PurchaseOrder
        fields = [
            "id", "po_number", "supplier", "description", "amount", "quantity",
            "budget", "budget_name", "delivery_date", "justification", "status",
            "requested_by", "requested_by_name",
            "approved_by", "approved_by_name",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "po_number", "status",
            "requested_by", "approved_by", "created_at", "updated_at",
        ]


class PaymentSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source="recorded_by.get_full_name", read_only=True)

    class Meta:
        model  = Payment
        fields = [
            "id", "reference", "payee", "amount", "type", "method",
            "payment_date", "status", "notes",
            "invoice", "expense",
            "recorded_by", "recorded_by_name",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "recorded_by", "created_at", "updated_at"]


class StipendSerializer(serializers.ModelSerializer):
    created_by_name   = serializers.CharField(source="created_by.get_full_name",   read_only=True)
    processed_by_name = serializers.CharField(source="processed_by.get_full_name", read_only=True)

    class Meta:
        model  = Stipend
        fields = [
            "id", "attachee_name", "department", "amount", "period",
            "start_date", "end_date", "payment_method", "status",
            "processed_by", "processed_by_name",
            "created_by", "created_by_name",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "status", "processed_by", "created_by", "created_at", "updated_at",
        ]


class FinancialReportSerializer(serializers.ModelSerializer):
    generated_by_name = serializers.CharField(source="generated_by.get_full_name", read_only=True)

    class Meta:
        model  = FinancialReport
        fields = [
            "id", "name", "type", "period", "file_url",
            "generated_by", "generated_by_name", "created_at",
        ]
        read_only_fields = ["id", "generated_by", "created_at"]