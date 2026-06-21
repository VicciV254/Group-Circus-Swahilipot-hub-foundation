"""Nexus Equipment Management — Inventory, Checkout, Maintenance"""
import uuid
from django.db import models
from django.utils import timezone
from rest_framework import serializers, generics, status, filters
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from core.models import TimeStampedModel, AuditedModel


class EquipmentCategory(TimeStampedModel):
    organisation = models.ForeignKey('accounts.Organisation', on_delete=models.CASCADE, related_name='equipment_categories')
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=50, blank=True)

    def __str__(self):
        return self.name


class EquipmentItem(TimeStampedModel):
    STATUS_CHOICES = [
        ('available', 'Available'),
        ('checked_out', 'Checked Out'),
        ('under_repair', 'Under Repair'),
        ('retired', 'Retired'),
        ('lost', 'Lost'),
        ('reserved', 'Reserved'),
    ]
    CONDITION_CHOICES = [
        ('excellent', 'Excellent'), ('good', 'Good'),
        ('fair', 'Fair'), ('poor', 'Poor'), ('damaged', 'Damaged'),
    ]

    organisation = models.ForeignKey('accounts.Organisation', on_delete=models.CASCADE, related_name='equipment_items')
    branch = models.ForeignKey('accounts.Branch', on_delete=models.SET_NULL, null=True, blank=True, related_name='equipment_items')
    category = models.ForeignKey(EquipmentCategory, on_delete=models.SET_NULL, null=True, related_name='items')
    asset_tag = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    make = models.CharField(max_length=100, blank=True)
    model = models.CharField(max_length=100, blank=True)
    serial_number = models.CharField(max_length=100, blank=True)
    purchase_date = models.DateField(null=True, blank=True)
    purchase_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    current_value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='available')
    condition = models.CharField(max_length=20, choices=CONDITION_CHOICES, default='good')
    location = models.CharField(max_length=200, blank=True)
    photo = models.ImageField(upload_to='equipment/photos/', null=True, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    qr_code = models.CharField(max_length=100, unique=True, blank=True)

    class Meta:  # type: ignore
        ordering = ['category', 'name']
        indexes = [models.Index(fields=['status', 'organisation']), models.Index(fields=['asset_tag'])]

    def __str__(self):
        return f"{self.asset_tag} — {self.name}"

    def save(self, *args, **kwargs):
        if not self.qr_code:
            self.qr_code = f"EQ-{str(uuid.uuid4())[:8].upper()}"
        super().save(*args, **kwargs)


class CheckoutRequest(TimeStampedModel):
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('active', 'Checked Out'),
        ('returned', 'Returned'),
        ('overdue', 'Overdue'),
    ]

    item = models.ForeignKey(EquipmentItem, on_delete=models.CASCADE, related_name='checkout_requests')
    requested_by = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='checkout_requests')
    approved_by = models.ForeignKey('accounts.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='approved_checkouts')
    start_date = models.DateField()
    end_date = models.DateField()
    actual_return_date = models.DateField(null=True, blank=True)
    purpose = models.TextField()
    project_reference = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    rejection_reason = models.TextField(blank=True)
    condition_on_checkout = models.CharField(max_length=20, blank=True)
    condition_on_return = models.CharField(max_length=20, blank=True)
    return_notes = models.TextField(blank=True)
    overdue_alert_sent = models.BooleanField(default=False)

    class Meta:  # type: ignore
        ordering = ['-created_at']

    def is_overdue(self):
        if self.status == 'active' and self.end_date < timezone.now().date():
            return True
        return False


class MaintenanceLog(TimeStampedModel):
    STATUS_CHOICES = [
        ('reported', 'Reported'), ('in_progress', 'In Progress'),
        ('repaired', 'Repaired'), ('unrepairable', 'Unrepairable'),
    ]
    item = models.ForeignKey(EquipmentItem, on_delete=models.CASCADE, related_name='maintenance_logs')
    reported_by = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='maintenance_reports')
    assigned_to = models.ManyToManyField(
        'accounts.User',
        related_name='maintenance_assignments',  # ← unique name
        blank=True,
    )
    departments = models.ManyToManyField(
        'accounts.Department',
        related_name='tasks',
        blank=True,
    )
    is_bulk = models.BooleanField(default=False)
    issue_description = models.TextField()
    resolution_description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='reported')
    repair_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    repair_date = models.DateField(null=True, blank=True)
    photo_before = models.ImageField(upload_to='equipment/maintenance/', null=True, blank=True)
    photo_after = models.ImageField(upload_to='equipment/maintenance/', null=True, blank=True)

    class Meta:  # type: ignore
        ordering = ['-created_at']


# ─── SERIALIZERS ─────────────────────────────────────────────────────────────

class EquipmentCategorySerializer(serializers.ModelSerializer):
    item_count = serializers.SerializerMethodField()
    class Meta:  # type: ignore
        model = EquipmentCategory
        fields = '__all__'
    def get_item_count(self, obj):
        return obj.items.filter(is_active=True).count()


class EquipmentItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    current_borrower = serializers.SerializerMethodField()
    due_return_date = serializers.SerializerMethodField()
    active_maintenance = serializers.SerializerMethodField()

    class Meta:  # type: ignore
        model = EquipmentItem
        fields = '__all__'
        read_only_fields = ['organisation', 'qr_code']

    def get_current_borrower(self, obj):
        checkout = obj.checkout_requests.filter(status__in=['active', 'overdue']).first()
        if checkout:
            return {'name': checkout.requested_by.full_name, 'id': str(checkout.requested_by.id)}
        return None

    def get_due_return_date(self, obj):
        checkout = obj.checkout_requests.filter(status__in=['active', 'overdue']).first()
        return checkout.end_date if checkout else None

    def get_active_maintenance(self, obj):
        log = obj.maintenance_logs.filter(status__in=['reported', 'in_progress']).first()
        if log:
            return {'id': str(log.id), 'issue': log.issue_description[:100]}
        return None


class CheckoutRequestSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_asset_tag = serializers.CharField(source='item.asset_tag', read_only=True)
    requested_by_name = serializers.CharField(source='requested_by.full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.full_name', read_only=True)
    is_overdue = serializers.SerializerMethodField()

    class Meta:  # type: ignore
        model = CheckoutRequest
        fields = '__all__'
        read_only_fields = ['requested_by', 'status', 'approved_by', 'actual_return_date']

    def get_is_overdue(self, obj):
        return obj.is_overdue()


class MaintenanceLogSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    reported_by_name = serializers.CharField(source='reported_by.full_name', read_only=True)

    class Meta:  # type: ignore
        model = MaintenanceLog
        fields = '__all__'
        read_only_fields = ['reported_by']


# ─── VIEWS ───────────────────────────────────────────────────────────────────

class EquipmentInventoryView(generics.ListCreateAPIView):
    serializer_class = EquipmentItemSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'category', 'condition']
    search_fields = ['name', 'asset_tag', 'serial_number', 'make', 'model']
    ordering_fields = ['name', 'status', 'created_at']

    def get_queryset(self):
        return EquipmentItem.objects.filter(
            organisation=self.request.user.organisation, is_active=True
        ).select_related('category')

    def perform_create(self, serializer):
        serializer.save(organisation=self.request.user.organisation)


class EquipmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = EquipmentItemSerializer

    def get_queryset(self):
        return EquipmentItem.objects.filter(organisation=self.request.user.organisation)

    def destroy(self, request, *args, **kwargs):
        """
        Equipment is never hard-deleted (it has checkout/maintenance history
        tied to it). DELETE instead soft-retires the item, same as the
        explicit retire endpoint.
        """
        item = self.get_object()
        if item.status in ('checked_out',):
            return Response(
                {'detail': 'Cannot retire an item that is currently checked out.'},
                status=400,
            )
        item.status = 'retired'
        item.is_active = False
        item.save(update_fields=['status', 'is_active'])
        return Response(EquipmentItemSerializer(item).data)


class RetireEquipmentView(APIView):
    """Explicit, intention-revealing endpoint for retiring an item from the inventory table."""

    def post(self, request, pk):
        try:
            item = EquipmentItem.objects.get(pk=pk, organisation=request.user.organisation)
        except EquipmentItem.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)

        if item.status == 'checked_out':
            return Response(
                {'detail': 'Cannot retire an item that is currently checked out. Return it first.'},
                status=400,
            )
        if item.status == 'retired':
            return Response({'detail': 'Item is already retired.'}, status=400)

        item.status = 'retired'
        item.is_active = False
        reason = request.data.get('reason', '')
        if reason:
            item.notes = (item.notes + '\n\n' if item.notes else '') + f"Retired: {reason}"
            item.save(update_fields=['status', 'is_active', 'notes'])
        else:
            item.save(update_fields=['status', 'is_active'])

        return Response(EquipmentItemSerializer(item).data)


class ReactivateEquipmentView(APIView):
    """Bring a retired item back into the active inventory."""

    def post(self, request, pk):
        try:
            item = EquipmentItem.objects.get(
                pk=pk, organisation=request.user.organisation, status='retired'
            )
        except EquipmentItem.DoesNotExist:
            return Response({'detail': 'Retired item not found'}, status=404)

        item.status = 'available'
        item.is_active = True
        item.save(update_fields=['status', 'is_active'])
        return Response(EquipmentItemSerializer(item).data)


class CheckoutRequestListView(generics.ListCreateAPIView):
    serializer_class = CheckoutRequestSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['status', 'item']

    def get_queryset(self):
        user = self.request.user
        qs = CheckoutRequest.objects.filter(
            item__organisation=user.organisation
        ).select_related('item', 'requested_by', 'approved_by')
        if user.role in ['broadcast_student', 'attachee']:
            return qs.filter(requested_by=user)
        return qs

    def perform_create(self, serializer):
        item = serializer.validated_data['item']
        if item.status != 'available':
            raise serializers.ValidationError({'detail': f'Item is not available — current status: {item.get_status_display()}'})
        # Block double-booking
        conflict = CheckoutRequest.objects.filter(
            item=item,
            status__in=['approved', 'active', 'overdue'],
            start_date__lte=serializer.validated_data['end_date'],
            end_date__gte=serializer.validated_data['start_date'],
        ).exists()
        if conflict:
            raise serializers.ValidationError({'detail': 'Item is already booked for the selected dates.'})
        serializer.save(requested_by=self.request.user)


class ApproveCheckoutView(APIView):
    def post(self, request, pk):
        try:
            checkout = CheckoutRequest.objects.get(pk=pk, item__organisation=request.user.organisation)
        except CheckoutRequest.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)

        action = request.data.get('action')
        if action == 'approve':
            checkout.status = 'active'
            checkout.approved_by = request.user
            checkout.condition_on_checkout = checkout.item.condition
            checkout.item.status = 'checked_out'
            checkout.item.save(update_fields=['status'])
        elif action == 'reject':
            checkout.status = 'rejected'
            checkout.rejection_reason = request.data.get('reason', '')
        else:
            return Response({'detail': 'action must be approve or reject'}, status=400)

        checkout.save()

        # Notify requester
        try:
            from apps.notifications.services import NotificationService
            title = f"Checkout {'Approved' if action == 'approve' else 'Rejected'} — {checkout.item.name}"
            body = f"Your request to checkout {checkout.item.name} has been {action}d."
            NotificationService.notify_user(checkout.requested_by, title, body, 'checkout_update')
        except Exception:
            pass

        return Response(CheckoutRequestSerializer(checkout).data)


class ReturnEquipmentView(APIView):
    def post(self, request, pk):
        try:
            checkout = CheckoutRequest.objects.get(
                pk=pk, item__organisation=request.user.organisation, status__in=['active', 'overdue']
            )
        except CheckoutRequest.DoesNotExist:
            return Response({'detail': 'Active checkout not found'}, status=404)

        checkout.status = 'returned'
        checkout.actual_return_date = timezone.now().date()
        checkout.condition_on_return = request.data.get('condition', checkout.item.condition)
        checkout.return_notes = request.data.get('notes', '')
        checkout.item.status = 'available'
        checkout.item.condition = checkout.condition_on_return
        checkout.item.save(update_fields=['status', 'condition'])
        checkout.save()
        return Response(CheckoutRequestSerializer(checkout).data)


class MaintenanceLogView(generics.ListCreateAPIView):
    serializer_class = MaintenanceLogSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['status', 'item']
    ordering_fields = ['created_at', 'repair_date']

    def get_queryset(self):
        return MaintenanceLog.objects.filter(
            item__organisation=self.request.user.organisation
        ).select_related('item', 'reported_by')

    def perform_create(self, serializer):
        item = serializer.validated_data['item']
        serializer.save(reported_by=self.request.user)
        # Mark item as under repair
        item.status = 'under_repair'
        item.save(update_fields=['status'])


class MaintenanceLogDetailView(generics.RetrieveUpdateAPIView):
    """Lets staff edit a maintenance log (e.g. add notes) without resolving it."""
    serializer_class = MaintenanceLogSerializer

    def get_queryset(self):
        return MaintenanceLog.objects.filter(
            item__organisation=self.request.user.organisation
        ).select_related('item', 'reported_by')


class ResolveMaintenanceView(APIView):
    """
    Closes out a maintenance log and restores the equipment item to service
    (or retires it, if it couldn't be fixed).

    POST body:
        resolution: 'repaired' | 'unrepairable'   (required)
        resolution_description: str               (required)
        repair_cost: decimal                       (optional)
        item_condition: str                         (optional, defaults to item's current condition)
    """

    def post(self, request, pk):
        try:
            log = MaintenanceLog.objects.get(
                pk=pk, item__organisation=request.user.organisation
            )
        except MaintenanceLog.DoesNotExist:
            return Response({'detail': 'Maintenance log not found'}, status=404)

        if log.status in ('repaired', 'unrepairable'):
            return Response({'detail': 'This maintenance log is already closed.'}, status=400)

        resolution = request.data.get('resolution')
        if resolution not in ('repaired', 'unrepairable'):
            return Response(
                {'detail': "resolution must be 'repaired' or 'unrepairable'"}, status=400
            )

        resolution_description = request.data.get('resolution_description', '').strip()
        if not resolution_description:
            return Response({'detail': 'resolution_description is required'}, status=400)

        log.status = resolution
        log.resolution_description = resolution_description
        log.repair_date = timezone.now().date()
        repair_cost = request.data.get('repair_cost')
        if repair_cost not in (None, ''):
            log.repair_cost = repair_cost
        photo_after = request.FILES.get('photo_after')
        if photo_after:
            log.photo_after = photo_after
        log.save()

        item = log.item
        if item.status == 'under_repair':
            if resolution == 'repaired':
                item.status = 'available'
                new_condition = request.data.get('item_condition')
                if new_condition:
                    item.condition = new_condition
                item.save(update_fields=['status', 'condition'])
            else:  # unrepairable
                item.status = 'retired'
                item.is_active = False
                item.save(update_fields=['status', 'is_active'])

        try:
            from apps.notifications.services import NotificationService
            title = f"Maintenance Resolved — {item.name}"
            body = (
                f"{item.name} ({item.asset_tag}) has been marked as "
                f"{'repaired and is available again' if resolution == 'repaired' else 'unrepairable and retired'}."
            )
            NotificationService.notify_user(log.reported_by, title, body, 'maintenance_update')
        except Exception:
            pass

        return Response(MaintenanceLogSerializer(log).data)


class EquipmentStatsView(APIView):
    def get(self, request):
        org = request.user.organisation
        items = EquipmentItem.objects.filter(organisation=org, is_active=True)
        return Response({
            'total': items.count(),
            'available': items.filter(status='available').count(),
            'checked_out': items.filter(status='checked_out').count(),
            'under_repair': items.filter(status='under_repair').count(),
            'overdue_checkouts': CheckoutRequest.objects.filter(
                item__organisation=org, status='active',
                end_date__lt=timezone.now().date()
            ).count(),
            'pending_requests': CheckoutRequest.objects.filter(
                item__organisation=org, status='pending'
            ).count(),
        })
