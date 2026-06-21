from django.db import models
from core.models import TimeStampedModel



class OrgPolicy(TimeStampedModel):
    organisation         = models.OneToOneField('accounts.Organisation', on_delete=models.CASCADE, related_name="hr_policy")
    annual_leave_days    = models.PositiveIntegerField(default=21)
    sick_leave_days      = models.PositiveIntegerField(default=14)
    maternity_leave_days = models.PositiveIntegerField(default=90)
    paternity_leave_days = models.PositiveIntegerField(default=14)
    probation_weeks      = models.PositiveIntegerField(default=12)
    notice_weeks         = models.PositiveIntegerField(default=4)
    default_stipend_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:  # type: ignore
        verbose_name = "Organisation HR Policy"

    def __str__(self):
        return f"HR Policy — {self.organisation.name}"