import uuid
from django.db import models
from django.conf import settings

User = settings.AUTH_USER_MODEL


class Budget(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2)
    used_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    period = models.CharField(max_length=100, blank=True)
    department = models.CharField(max_length=255, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="budgets_created")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

    @property
    def remaining_amount(self):
        return self.total_amount - self.used_amount


class Expense(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("paid", "Paid"),
    ]
    CATEGORY_CHOICES = [
        ("transport", "Transport"),
        ("meals", "Meals"),
        ("accommodation", "Accommodation"),
        ("supplies", "Supplies"),
        ("equipment", "Equipment"),
        ("utilities", "Utilities"),
        ("maintenance", "Maintenance"),
        ("marketing", "Marketing"),
        ("other", "Other"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default="other")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    budget = models.ForeignKey(Budget, on_delete=models.SET_NULL, null=True, blank=True, related_name="expenses")
    receipt_date = models.DateField(null=True, blank=True)
    submitted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="expenses_submitted")
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="expenses_reviewed")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} — KES {self.amount}"


class Invoice(models.Model):
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("sent", "Sent"),
        ("paid", "Paid"),
        ("overdue", "Overdue"),
        ("cancelled", "Cancelled"),
    ]
    TYPE_CHOICES = [
        ("incoming", "Incoming"),
        ("outgoing", "Outgoing"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice_number = models.CharField(max_length=100, unique=True, blank=True)
    invoice_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default="incoming")
    vendor = models.CharField(max_length=255)          # vendor or client name
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    issue_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    paid_date = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="invoices_created")
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="invoices_approved")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            last = Invoice.objects.order_by("-created_at").first()
            count = (int(last.invoice_number.split("-")[-1]) + 1) if last and last.invoice_number else 1
            self.invoice_number = f"INV-{count:04d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.invoice_number} — {self.vendor}"


class Payroll(models.Model):
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("processed", "Processed"),
        ("paid", "Paid"),
        ("cancelled", "Cancelled"),
    ]
    PAYMENT_METHOD_CHOICES = [
        ("bank_transfer", "Bank Transfer"),
        ("mpesa", "M-Pesa"),
        ("cash", "Cash"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    employee = models.ForeignKey(User, on_delete=models.CASCADE, related_name="payroll_records")
    period = models.CharField(max_length=100)          # e.g. "June 2025"
    pay_date = models.DateField(null=True, blank=True)
    gross_pay = models.DecimalField(max_digits=14, decimal_places=2)
    deductions = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    net_pay = models.DecimalField(max_digits=14, decimal_places=2)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default="bank_transfer")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    notes = models.TextField(blank=True)
    processed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="payroll_processed")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.employee} — {self.period}"


class PettyCash(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("disbursed", "Disbursed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    date = models.DateField(null=True, blank=True)
    receipt_number = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    notes = models.TextField(blank=True)
    requested_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="petty_cash_requests")
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="petty_cash_approved")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Petty Cash"
        verbose_name_plural = "Petty Cash"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.description} — KES {self.amount}"


class PurchaseOrder(models.Model):
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("delivered", "Delivered"),
        ("cancelled", "Cancelled"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    po_number = models.CharField(max_length=100, unique=True, blank=True)
    supplier = models.CharField(max_length=255)
    description = models.TextField()
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    quantity = models.PositiveIntegerField(default=1)
    budget = models.ForeignKey(Budget, on_delete=models.SET_NULL, null=True, blank=True, related_name="purchase_orders")
    delivery_date = models.DateField(null=True, blank=True)
    justification = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    requested_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="purchase_orders_requested")
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="purchase_orders_approved")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.po_number:
            last = PurchaseOrder.objects.order_by("-created_at").first()
            count = (int(last.po_number.split("-")[-1]) + 1) if last and last.po_number else 1
            self.po_number = f"PO-{count:04d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.po_number} — {self.supplier}"


class Payment(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("completed", "Completed"),
        ("failed", "Failed"),
        ("reversed", "Reversed"),
    ]
    TYPE_CHOICES = [
        ("outgoing", "Outgoing"),
        ("incoming", "Incoming"),
    ]
    METHOD_CHOICES = [
        ("mpesa", "M-Pesa"),
        ("bank_transfer", "Bank Transfer"),
        ("cash", "Cash"),
        ("cheque", "Cheque"),
        ("card", "Card"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference = models.CharField(max_length=255, blank=True)
    payee = models.CharField(max_length=255)           # payee or payer name
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default="outgoing")
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, default="bank_transfer")
    payment_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="completed")
    notes = models.TextField(blank=True)
    # optional links to source records
    invoice = models.ForeignKey(Invoice, on_delete=models.SET_NULL, null=True, blank=True, related_name="payments")
    expense = models.ForeignKey(Expense, on_delete=models.SET_NULL, null=True, blank=True, related_name="payments")
    recorded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="payments_recorded")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.reference or self.id} — KES {self.amount}"


class Stipend(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("processed", "Processed"),
        ("paid", "Paid"),
        ("cancelled", "Cancelled"),
    ]
    PAYMENT_METHOD_CHOICES = [
        ("mpesa", "M-Pesa"),
        ("bank_transfer", "Bank Transfer"),
        ("cash", "Cash"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    attachee_name = models.CharField(max_length=255)
    department = models.CharField(max_length=255, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    period = models.CharField(max_length=100, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default="mpesa")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    processed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="stipends_processed")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="stipends_created")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.attachee_name} — {self.period}"


class FinancialReport(models.Model):
    TYPE_CHOICES = [
        ("income_statement", "Income Statement"),
        ("balance_sheet", "Balance Sheet"),
        ("cash_flow", "Cash Flow"),
        ("expense_report", "Expense Report"),
        ("custom", "Custom"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=50, choices=TYPE_CHOICES, default="custom")
    period = models.CharField(max_length=100, blank=True)
    file_url = models.URLField(blank=True)
    generated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="reports_generated")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.type})"
