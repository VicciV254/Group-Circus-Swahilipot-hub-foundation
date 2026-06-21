"""Nexus Equipment — Category Views"""
from rest_framework import generics
from .models import EquipmentCategory, EquipmentCategorySerializer


class EquipmentCategoryView(generics.ListCreateAPIView):
    serializer_class = EquipmentCategorySerializer

    def get_queryset(self):
        return EquipmentCategory.objects.filter(
            organisation=self.request.user.organisation
        )

    def perform_create(self, serializer):
        serializer.save(organisation=self.request.user.organisation)
