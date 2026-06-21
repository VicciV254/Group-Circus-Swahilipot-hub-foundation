from rest_framework import serializers
from .models import ShootBooking, Footage


class ShootBookingSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.SerializerMethodField()
    # Return equipment as list of IDs for the frontend
    equipment_list = serializers.PrimaryKeyRelatedField(
        many=True,
        read_only=False,
        queryset=__import__('apps.equipment.models', fromlist=['EquipmentItem']).EquipmentItem.objects.all(),
        required=False,
    )

    class Meta:  # type: ignore
        model  = ShootBooking
        fields = [
            'id', 'title', 'requested_by', 'requested_by_name',
            'shoot_date', 'duration_hours', 'location',
            'production_brief', 'equipment_list',
            'status', 'admin_notes', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'requested_by', 'status', 'created_at', 'updated_at']

    def get_requested_by_name(self, obj):
        if obj.requested_by:
            return obj.requested_by.get_full_name() or obj.requested_by.email
        return None

    def create(self, validated_data):
        equipment = validated_data.pop('equipment_list', [])
        booking   = ShootBooking.objects.create(**validated_data)
        if equipment:
            booking.equipment_list.set(equipment)
        return booking

    def update(self, instance, validated_data):
        equipment = validated_data.pop('equipment_list', None)
        instance  = super().update(instance, validated_data)
        if equipment is not None:
            instance.equipment_list.set(equipment)
        return instance


class FootageSerializer(serializers.ModelSerializer):
    class Meta:  # type: ignore
        model  = Footage
        fields = [
            'id', 'booking', 'uploaded_by', 'title',
            'filename', 'file_size_mb', 'created_at',
        ]
        read_only_fields = ['id', 'uploaded_by', 'filename', 'file_size_mb', 'created_at']