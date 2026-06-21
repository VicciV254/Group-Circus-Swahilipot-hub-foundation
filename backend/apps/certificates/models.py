"""NEXUS Certificate Management — Certificates, Badges, Verification"""
import uuid
from io import BytesIO
from django.db import models
from django.utils import timezone
from django.http import HttpResponse
from rest_framework import serializers, generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from core.models import TimeStampedModel


class Certificate(TimeStampedModel):
    TYPE_CHOICES = [
        ('completion',     'Certificate of Completion'),
        ('recommendation', 'Recommendation Letter'),
        ('achievement',    'Achievement Award'),
        ('participation',  'Participation Certificate'),
    ]
    STATUS_CHOICES = [
        ('pending',   'Pending'),
        ('generated', 'Generated'),
        ('issued',    'Issued'),
        ('revoked',   'Revoked'),
    ]

    organisation        = models.ForeignKey('accounts.Organisation', on_delete=models.CASCADE, related_name='certificates')
    recipient           = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='cert_certificates')
    issued_by           = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='cert_issued_certificates')
    certificate_type    = models.CharField(max_length=20, choices=TYPE_CHOICES, default='completion')
    status              = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    certificate_number  = models.CharField(max_length=50, unique=True, blank=True)
    qr_verification_code = models.CharField(max_length=100, unique=True, blank=True)
    issue_date          = models.DateField(null=True, blank=True)
    signed_by_name      = models.CharField(max_length=200, blank=True)
    signed_by_title     = models.CharField(max_length=200, blank=True)
    pdf_file            = models.FileField(upload_to='certificates/pdfs/', null=True, blank=True)
    notes               = models.TextField(blank=True)

    class Meta:  # type: ignore
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['organisation', 'status']),
            models.Index(fields=['qr_verification_code']),
            models.Index(fields=['certificate_number']),
        ]

    def __str__(self):
        return f"{self.certificate_number} — {self.recipient}"

    def save(self, *args, **kwargs):
        if not self.certificate_number:
            year = timezone.now().year
            uid  = str(uuid.uuid4())[:6].upper()
            self.certificate_number = f"NX-{year}-{uid}"
        if not self.qr_verification_code:
            self.qr_verification_code = f"VERIFY-{str(uuid.uuid4())[:12].upper()}"
        super().save(*args, **kwargs)


class Badge(TimeStampedModel):
    organisation  = models.ForeignKey('accounts.Organisation', on_delete=models.CASCADE, related_name='badges')
    recipient     = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='cert_badges')
    certificate   = models.ForeignKey(Certificate, on_delete=models.SET_NULL, null=True, blank=True, related_name='badges')
    name          = models.CharField(max_length=200)
    description   = models.TextField(blank=True)
    icon          = models.CharField(max_length=100, blank=True)
    awarded_date  = models.DateField(default=timezone.now)

    class Meta:  # type: ignore
        ordering = ['-awarded_date']

    def __str__(self):
        return f"{self.name} — {self.recipient}"


# ─── SERIALIZERS ─────────────────────────────────────────────────────────────

class CertificateSerializer(serializers.ModelSerializer):
    recipient_name  = serializers.CharField(source='recipient.full_name', read_only=True)
    issued_by_name  = serializers.CharField(source='issued_by.full_name',  read_only=True)

    class Meta:  # type: ignore
        model  = Certificate
        fields = '__all__'
        read_only_fields = ['organisation', 'certificate_number', 'qr_verification_code', 'issued_by', 'status']


class BadgeSerializer(serializers.ModelSerializer):
    recipient_name = serializers.CharField(source='recipient.full_name', read_only=True)

    class Meta:  # type: ignore
        model  = Badge
        fields = '__all__'
        read_only_fields = ['organisation']


# ─── VIEWS ───────────────────────────────────────────────────────────────────

class CertificateListView(generics.ListAPIView):
    serializer_class = CertificateSerializer

    def get_queryset(self):
        user = self.request.user
        qs   = Certificate.objects.filter(organisation=user.organisation).select_related('recipient', 'issued_by')
        if user.role in ['broadcast_student', 'attachee']:
            return qs.filter(recipient=user)
        return qs


class CertificateDetailView(generics.RetrieveAPIView):
    serializer_class = CertificateSerializer

    def get_queryset(self):
        user = self.request.user
        qs   = Certificate.objects.filter(organisation=user.organisation)
        if user.role in ['broadcast_student', 'attachee']:
            return qs.filter(recipient=user)
        return qs


class GenerateCertificateView(APIView):
    def post(self, request):
        attachee_id      = request.data.get('attachee_id')
        certificate_type = request.data.get('certificate_type', 'completion')
        signed_by_name   = request.data.get('signed_by_name', '')
        signed_by_title  = request.data.get('signed_by_title', '')

        if not attachee_id:
            return Response({'detail': 'attachee_id is required.'}, status=400)
        if not signed_by_name:
            return Response({'detail': 'signed_by_name is required.'}, status=400)

        try:
            from apps.accounts.models import User
            recipient = User.objects.get(id=attachee_id, organisation=request.user.organisation)
        except User.DoesNotExist:
            return Response({'detail': 'Recipient not found in your organisation.'}, status=404)

        cert = Certificate.objects.create(
            organisation     = request.user.organisation,
            recipient        = recipient,
            issued_by        = request.user,
            certificate_type = certificate_type,
            signed_by_name   = signed_by_name,
            signed_by_title  = signed_by_title,
            status           = 'generated',
            issue_date       = timezone.now().date(),
        )

        # Notify recipient
        try:
            from apps.notifications.services import NotificationService
            NotificationService.notify_user(
                recipient,
                f"Certificate Issued — {cert.get_certificate_type_display()}",
                f"Your {cert.get_certificate_type_display()} has been generated. Certificate number: {cert.certificate_number}",
                'certificate_issued',
            )
        except Exception:
            pass

        return Response(CertificateSerializer(cert).data, status=201)


class DownloadCertificateView(APIView):
    def get(self, request, pk):
        try:
            user = request.user
            qs   = Certificate.objects.filter(organisation=user.organisation)
            if user.role in ['broadcast_student', 'attachee']:
                qs = qs.filter(recipient=user)
            cert = qs.get(pk=pk)
        except Certificate.DoesNotExist:
            return Response({'detail': 'Certificate not found.'}, status=404)

        if cert.status not in ['generated', 'issued']:
            return Response({'detail': 'Certificate is not ready for download.'}, status=400)

        # Return existing PDF if already generated
        if cert.pdf_file:
            response = HttpResponse(cert.pdf_file.read(), content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="certificate-{cert.certificate_number}.pdf"'
            return response

        # Generate PDF on the fly using reportlab if available
        try:
            pdf_bytes = _generate_pdf(cert)
            response  = HttpResponse(pdf_bytes, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="certificate-{cert.certificate_number}.pdf"'
            # Optionally persist
            from django.core.files.base import ContentFile
            cert.pdf_file.save(f"{cert.certificate_number}.pdf", ContentFile(pdf_bytes), save=True)
            cert.status = 'issued'
            cert.save(update_fields=['status'])
            return response
        except Exception as e:
            return Response({'detail': f'PDF generation failed: {str(e)}'}, status=500)


def _generate_pdf(cert: Certificate) -> bytes:
    """
    Generate a production-quality certificate PDF styled after the classic academic
    certificate design:
    - Warm parchment/ivory background
    - Ornate floral apple-motif border (double-line with decorative tiles)
    - Heraldic crest/shield with crown and laurel supporters at top centre
    - Spaced-letter institution name in Lora serif
    - Faculty subtitle and italicised presentation text
    - Recipient name in large GreatVibes script font
    - Award label in script
    - Ornate triple decorative rule with diamond end-caps
    - Two signature blocks with squiggle + cert number + date
    - QR verification code bottom-right
    """
    import os
    import math
    import qrcode
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.lib.units import cm, mm
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    # ── Font paths (Windows dev + Linux production) ───────────────────────────
    _BASE  = os.path.dirname(os.path.abspath(__file__))
    _FONTS = os.path.join(_BASE, 'fonts')

    if os.name == 'nt':  # Windows
        _WIN = r'C:\Windows\Fonts'
        _SER_REG  = os.path.join(_WIN, 'times.ttf')
        _SER_BOLD = os.path.join(_WIN, 'timesbd.ttf')
        _SER_ITAL = os.path.join(_WIN, 'timesi.ttf')
    else:  # Linux / production server
        _LIB      = '/usr/share/fonts/truetype/liberation'
        _SER_REG  = os.path.join(_LIB, 'LiberationSerif-Regular.ttf')
        _SER_BOLD = os.path.join(_LIB, 'LiberationSerif-Bold.ttf')
        _SER_ITAL = os.path.join(_LIB, 'LiberationSerif-Italic.ttf')

    for _fname, _fpath in [
        ('GreatVibes',     os.path.join(_FONTS, 'GreatVibes-Regular.ttf')),
        ('Lora',           os.path.join(_FONTS, 'Lora-Variable.ttf')),
        ('LoraItalic',     os.path.join(_FONTS, 'Lora-Italic-Variable.ttf')),
        ('LibSerifReg',    _SER_REG),
        ('LibSerifBold',   _SER_BOLD),
        ('LibSerifItalic', _SER_ITAL),
    ]:
        try:
            pdfmetrics.registerFont(TTFont(_fname, _fpath))
        except Exception:
            pass  # Already registered or path missing — falls back gracefully

    # ── Colour palette ────────────────────────────────────────────────────────
    C_IVORY = colors.HexColor('#f3f0e4')
    C_D     = colors.HexColor('#2c4a6e')
    C_M     = colors.HexColor('#3d6491')
    C_L     = colors.HexColor('#6b9abd')
    C_NAVY  = colors.HexColor('#1c3050')
    C_TXT   = colors.HexColor('#2c4a6e')
    C_SUB   = colors.HexColor('#4a6580')
    C_GOLD  = colors.HexColor('#8b7440')
    C_WHITE = colors.white

    # ── QR Code ───────────────────────────────────────────────────────────────
    verify_url = f"http://localhost:5173/verify/{cert.qr_verification_code}"
    qr = qrcode.QRCode(version=2, box_size=8, border=2,
                       error_correction=qrcode.constants.ERROR_CORRECT_H)
    qr.add_data(verify_url)
    qr.make(fit=True)
    qr_img    = qr.make_image(fill_color=(40, 60, 80), back_color=(255, 255, 255))
    qr_buffer = BytesIO()
    qr_img.save(qr_buffer, format='PNG')
    qr_buffer.seek(0)

    W, H = landscape(A4)
    cx   = W / 2
    buf  = BytesIO()
    c    = rl_canvas.Canvas(buf, pagesize=landscape(A4))
    c.setTitle(f'Certificate — {cert.recipient.full_name}')

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _leaf(x, y, r, angle, col):
        c.saveState(); c.translate(x, y); c.rotate(angle); c.setFillColor(col)
        p = c.beginPath()
        p.moveTo(0, -r); p.curveTo(r*.55, -r*.4, r*.55, r*.4, 0, r)
        p.curveTo(-r*.55, r*.4, -r*.55, -r*.4, 0, -r)
        c.drawPath(p, fill=1, stroke=0); c.restoreState()

    def _apple(x, y, r):
        c.setFillColor(C_D); c.circle(x, y, r, fill=1, stroke=0)
        c.setFillColor(C_L); c.circle(x + r*.26, y + r*.30, r*.27, fill=1, stroke=0)
        c.setStrokeColor(C_D); c.setLineWidth(.65)
        c.line(x, y + r, x, y + r + r*.55)
        _leaf(x + r*.44, y + r + r*.32, r*.50, 35, C_M)

    def _border():
        PAD_O, PAD_I = 5.5*mm, 15.5*mm
        mid = (PAD_O + PAD_I) / 2
        tr, sp = 3.2*mm, 3.2*mm * 3.0
        c.setFillColor(C_IVORY); c.rect(0, 0, W, H, fill=1, stroke=0)
        x = PAD_O + sp*.5
        while x < W - PAD_O - tr:
            _apple(x, H - mid, tr); x += sp
        x = PAD_O + sp*.5
        while x < W - PAD_O - tr:
            _apple(x, mid, tr); x += sp
        y = PAD_O + sp*.5
        while y < H - PAD_O - tr:
            _apple(mid, y, tr); y += sp
        y = PAD_O + sp*.5
        while y < H - PAD_O - tr:
            _apple(W - mid, y, tr); y += sp
        c.setStrokeColor(C_D); c.setLineWidth(2.5)
        c.rect(PAD_O, PAD_O, W - 2*PAD_O, H - 2*PAD_O, fill=0, stroke=1)
        c.setLineWidth(1.8)
        c.rect(PAD_I, PAD_I, W - 2*PAD_I, H - 2*PAD_I, fill=0, stroke=1)
        c.setStrokeColor(C_M); c.setLineWidth(.5)
        ii = PAD_I + 1.5*mm
        c.rect(ii, ii, W - 2*ii, H - 2*ii, fill=0, stroke=1)
        sq = 6.5*mm
        for bx, by in [(PAD_I, PAD_I), (W-PAD_I-sq, PAD_I),
                       (PAD_I, H-PAD_I-sq), (W-PAD_I-sq, H-PAD_I-sq)]:
            c.setFillColor(C_D); c.rect(bx, by, sq, sq, fill=1, stroke=0)
            p = 1.1*mm; c.setFillColor(C_IVORY)
            c.rect(bx+p, by+p, sq-2*p, sq-2*p, fill=1, stroke=0)
            c.setFillColor(C_M); c.circle(bx+sq/2, by+sq/2, 1.4*mm, fill=1, stroke=0)

    def _crest(cx2, cy):
        sw2, sh2 = 16*mm, 20*mm

        def _shield_p():
            hw, hh = sw2/2, sh2/2
            p = c.beginPath()
            p.moveTo(-hw, hh*.35); p.lineTo(-hw, hh); p.lineTo(hw, hh); p.lineTo(hw, hh*.35)
            p.curveTo(hw, -hh*.15, sw2*.28, -hh*.85, 0, -hh)
            p.curveTo(-sw2*.28, -hh*.85, -hw, -hh*.15, -hw, hh*.35); p.close()
            return p

        c.saveState(); c.translate(cx2, cy)
        c.saveState(); c.setFillAlpha(.18); c.setFillColor(colors.black)
        c.translate(1.2, -1.2); c.drawPath(_shield_p(), fill=1, stroke=0); c.restoreState()
        c.setFillColor(C_NAVY); c.drawPath(_shield_p(), fill=1, stroke=0)
        for sign in (-1, 1):
            p = c.beginPath()
            p.moveTo(sign*sw2/2, 0); p.lineTo(sign*sw2/2, sh2/2)
            p.lineTo(0, sh2/2); p.lineTo(0, 0); p.close()
            c.setFillColor(C_M); c.drawPath(p, fill=1, stroke=0)
        cw2 = 2.8*mm; c.setFillColor(C_WHITE)
        c.rect(-cw2/2, -sh2/2+1, cw2, sh2-2, fill=1, stroke=0)
        c.rect(-sw2/2+1, sh2/2-sh2*.32, sw2-2, cw2, fill=1, stroke=0)
        c.setStrokeColor(colors.HexColor('#0d1e30')); c.setLineWidth(1.0)
        c.drawPath(_shield_p(), fill=0, stroke=1)
        cr_y = sh2/2; cr_w = sw2*.88; cr_h = 6*mm
        c.setFillColor(C_GOLD); c.roundRect(-cr_w/2, cr_y, cr_w, cr_h*.28, .8, fill=1, stroke=0)
        tw2 = cr_w/5; ths = [cr_h*.85, cr_h*.5, cr_h*.85, cr_h*.5, cr_h*.85]
        for i, th in enumerate(ths):
            c.rect(-cr_w/2 + i*tw2 + tw2*.1, cr_y, tw2*.8, th, fill=1, stroke=0)
        for i in (0, 2, 4):
            c.circle(-cr_w/2 + i*tw2 + tw2/2, cr_y + ths[i], 1.8*mm, fill=1, stroke=0)
        for side in (-1, 1):
            for j in range(4):
                _leaf(side*(sw2/2+1.5*mm+j*3*mm), sh2/2*.38-j*3*mm,
                      4.8*mm, side*(42+j*20), C_M)
        c.restoreState()

    def _rule(y, hw):
        c.setStrokeColor(C_D); c.setFillColor(C_D)
        c.setLineWidth(1.0); c.line(cx-hw, y, cx+hw, y)
        c.setLineWidth(.4)
        for off in (2.5, -2.5):
            c.line(cx-hw*.86, y+off, cx+hw*.86, y+off)
        d = 4.2
        for sx in (-1, 1):
            x0 = cx + sx*(hw+4)
            p  = c.beginPath()
            p.moveTo(x0, y+d); p.lineTo(x0+d, y)
            p.lineTo(x0, y-d); p.lineTo(x0-d, y); p.close()
            c.drawPath(p, fill=1, stroke=0)
        p2 = c.beginPath()
        p2.moveTo(cx, y+3.2); p2.lineTo(cx+3.2, y)
        p2.lineTo(cx, y-3.2); p2.lineTo(cx-3.2, y); p2.close()
        c.drawPath(p2, fill=1, stroke=0)

    def _spaced(text, y, font, size, ls=3.2):
        c.setFont(font, size)
        tw = sum(c.stringWidth(ch, font, size) for ch in text) + ls*(len(text)-1)
        x  = cx - tw/2
        for ch in text:
            c.drawString(x, y, ch); x += c.stringWidth(ch, font, size) + ls

    def _sig(x, line_y, name, title, hw):
        c.saveState(); c.setStrokeColor(C_TXT); c.setLineWidth(1.0)
        sw3 = hw*.82; sx = x - sw3; sy = line_y + 3.5*mm
        p   = c.beginPath()
        p.moveTo(sx, sy)
        p.curveTo(sx+sw3*.18, sy+5*mm,  sx+sw3*.48, sy-4*mm,  sx+sw3*.70, sy+3*mm)
        p.curveTo(sx+sw3*.86, sy+6.5*mm, sx+sw3*1.02, sy+1*mm, sx+sw3*1.16, sy)
        p.moveTo(sx+sw3*.08, sy-2*mm)
        p.curveTo(sx+sw3*.5, sy-5.5*mm, sx+sw3*.92, sy-2*mm, sx+sw3*1.16, sy)
        c.drawPath(p, fill=0, stroke=1); c.restoreState()
        c.setStrokeColor(C_D); c.setLineWidth(.7)
        c.line(x-hw, line_y, x+hw, line_y)
        max_w = hw*2 - 3*mm; fs = 9.5
        c.setFont('LibSerifBold', fs)
        while c.stringWidth(name, 'LibSerifBold', fs) > max_w and fs > 6:
            fs -= .4
        c.setFont('LibSerifBold', fs); c.setFillColor(C_NAVY)
        c.drawCentredString(x, line_y - 4.5*mm, name)
        c.setFont('LibSerifItalic', 8); c.setFillColor(C_SUB)
        while c.stringWidth(title, 'LibSerifItalic', 8) > max_w and len(title) > 4:
            title = title[:-4]+'...'
        c.drawCentredString(x, line_y - 9*mm, title)

    # ── Render ────────────────────────────────────────────────────────────────
    c.setFillColor(C_IVORY); c.rect(0, 0, W, H, fill=1, stroke=0)
    _border()

    INNER_TOP = H - 17*mm

    y = INNER_TOP - 2.2*cm
    _crest(cx, y)

    y -= 2.55*cm
    c.setFillColor(C_NAVY)
    org_display = (cert.organisation.name if cert.organisation and cert.organisation.name
                   else 'NEXUS ENTERPRISE').upper()
    _spaced(org_display, y, 'Lora', 21, ls=3.5)

    y -= 1.25*cm
    cert_type_label = cert.get_certificate_type_display()
    c.setFont('LoraItalic', 11.5); c.setFillColor(C_TXT)
    c.drawCentredString(cx, y, f'Faculty of Science Department of {cert_type_label}')

    y -= 1.0*cm
    c.setFont('LoraItalic', 10); c.setFillColor(C_TXT)
    c.drawCentredString(cx, y, 'On the recognition of successful completion of the requisite course of study')
    y -= 5*mm
    c.drawCentredString(cx, y, 'and upon certified nominees, we hereby confer upon')

    y -= 2.1*cm
    fs = 54
    c.setFont('GreatVibes', fs)
    while c.stringWidth(cert.recipient.full_name, 'GreatVibes', fs) > W*.70 and fs > 32:
        fs -= 1
    c.setFont('GreatVibes', fs); c.setFillColor(C_NAVY)
    c.drawCentredString(cx, y, cert.recipient.full_name)

    y -= 1.2*cm
    c.setFont('LoraItalic', 11); c.setFillColor(C_SUB)
    c.drawCentredString(cx, y, 'The degree of')

    y -= 1.3*cm
    fs2 = 36
    c.setFont('GreatVibes', fs2)
    while c.stringWidth(cert_type_label, 'GreatVibes', fs2) > W*.56 and fs2 > 22:
        fs2 -= 1
    c.setFont('GreatVibes', fs2); c.setFillColor(C_NAVY)
    c.drawCentredString(cx, y, cert_type_label)

    y -= 1.1*cm
    _rule(y, 10.2*cm)

    line_y = 3.6*cm; hw = 3.5*cm
    _sig(cx - 9.2*cm, line_y,
         cert.signed_by_name or '—',
         cert.signed_by_title or "Dean's Signature",
         hw)
    org_short = cert.organisation.name if cert.organisation else 'Organisation'
    _sig(cx + 9.2*cm, line_y, org_short, 'Board of University', hw)

    issue_str = cert.issue_date.strftime('%d %B %Y') if cert.issue_date else '—'
    c.setFont('LibSerifReg', 8.5); c.setFillColor(C_SUB)
    c.drawCentredString(cx, line_y - 4*mm,   f'Certificate No: {cert.certificate_number}')
    c.drawCentredString(cx, line_y - 8.5*mm, f'Awarded: {issue_str}')

    qr_sz = 1.85*cm; qr_x = W - 1.95*cm - qr_sz; qr_y2 = 1.55*cm
    c.setFillColor(C_WHITE)
    c.roundRect(qr_x-1*mm, qr_y2-1*mm, qr_sz+2*mm, qr_sz+3.5*mm, 2, fill=1, stroke=0)
    c.drawImage(ImageReader(qr_buffer), qr_x, qr_y2, width=qr_sz, height=qr_sz)
    c.setFont('LibSerifReg', 5); c.setFillColor(C_SUB)
    c.drawCentredString(qr_x+qr_sz/2, qr_y2-2.5*mm, 'SCAN TO VERIFY')

    c.save()
    return buf.getvalue()


class VerifyCertificateView(APIView):
    permission_classes = []  # Public endpoint

    def get(self, request, code):
        try:
            cert = Certificate.objects.select_related('recipient', 'issued_by').get(
                qr_verification_code=code
            )
        except Certificate.DoesNotExist:
            return Response({'valid': False, 'detail': 'Certificate not found.'}, status=404)

        return Response({
            'valid':               cert.status not in ['revoked', 'pending'],
            'certificate_number':  cert.certificate_number,
            'certificate_type':    cert.get_certificate_type_display(),
            'recipient_name':      cert.recipient.full_name,
            'issue_date':          cert.issue_date,
            'signed_by_name':      cert.signed_by_name,
            'signed_by_title':     cert.signed_by_title,
            'status':              cert.status,
            'organisation':        cert.organisation.name,
        })


class BadgeListView(generics.ListAPIView):
    serializer_class = BadgeSerializer

    def get_queryset(self):
        user = self.request.user
        qs   = Badge.objects.filter(organisation=user.organisation).select_related('recipient')
        if user.role in ['broadcast_student', 'attachee']:
            return qs.filter(recipient=user)
        return qs