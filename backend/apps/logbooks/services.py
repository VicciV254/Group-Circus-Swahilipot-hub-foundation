"""
apps/logbooks/services.py

Pure Python services — no HTML templates anywhere.
  - Plain-text email notifications via Django's send_mail
  - PDF generation via ReportLab (pip install reportlab)
"""
import io
from datetime import date
from django.conf import settings
from django.core.mail import send_mail


# ─────────────────────────────────────────────────────────
# Email helpers — plain text only
# ─────────────────────────────────────────────────────────

def _send(to_email: str, subject: str, body: str) -> None:
    """Fire-and-forget plain-text email. Never raises."""
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@nexus.app"),
            recipient_list=[to_email],
            fail_silently=True,
        )
    except Exception:
        pass


# ─────────────────────────────────────────────────────────
# ReportLab PDF helpers
# ─────────────────────────────────────────────────────────

def _get_rl():
    """Import ReportLab lazily so the app boots even without it."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import mm, cm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
            HRFlowable, PageBreak, KeepTogether,
        )
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
        return {
            "A4": A4, "colors": colors, "getSampleStyleSheet": getSampleStyleSheet,
            "ParagraphStyle": ParagraphStyle, "mm": mm, "cm": cm,
            "SimpleDocTemplate": SimpleDocTemplate, "Paragraph": Paragraph,
            "Spacer": Spacer, "Table": Table, "TableStyle": TableStyle,
            "HRFlowable": HRFlowable, "PageBreak": PageBreak,
            "KeepTogether": KeepTogether, "TA_CENTER": TA_CENTER,
            "TA_LEFT": TA_LEFT, "TA_RIGHT": TA_RIGHT,
        }
    except ImportError:
        return None


# ─────────────────────────────────────────────────────────
# Colour palette (matches Nexus dark theme)
# ─────────────────────────────────────────────────────────

PURPLE      = (0x4f/255, 0x46/255, 0xe5/255)   # #4f46e5  Nexus brand
PURPLE_DARK = (0x1e/255, 0x1b/255, 0x4b/255)   # #1e1b4b
GREEN       = (0x16/255, 0xa3/255, 0x4a/255)   # #16a34a
RED         = (0xdc/255, 0x26/255, 0x26/255)   # #dc2626
YELLOW      = (0xf5/255, 0x9e/255, 0x0b/255)   # #f59e0b
BLUE        = (0x1d/255, 0x4e/255, 0xd8/255)   # #1d4ed8
GRAY_DARK   = (0x11/255, 0x18/255, 0x27/255)   # #111827
GRAY_MID    = (0x37/255, 0x41/255, 0x51/255)   # #374151
GRAY_LIGHT  = (0x6b/255, 0x72/255, 0x80/255)   # #6b7280
GRAY_BORDER = (0xe5/255, 0xe7/255, 0xeb/255)   # #e5e7eb
WHITE       = (1, 1, 1)
BG_LIGHT    = (0xf9/255, 0xfa/255, 0xfb/255)   # #f9fafb


def _rl_color(rgb_tuple):
    from reportlab.lib.colors import Color
    return Color(*rgb_tuple)


# ─────────────────────────────────────────────────────────
# Status badge colours
# ─────────────────────────────────────────────────────────

STATUS_COLORS = {
    "draft":              (GRAY_LIGHT, BG_LIGHT),
    "submitted":          (BLUE,       (0xdb/255, 0xea/255, 0xfe/255)),
    "approved":           (GREEN,      (0xdc/255, 0xfc/255, 0xe7/255)),
    "rejected":           (RED,        (0xfe/255, 0xe2/255, 0xe2/255)),
    "revision_requested": (YELLOW,     (0xfe/255, 0xf3/255, 0xc7/255)),
}

STATUS_LABELS = {
    "draft":              "Draft",
    "submitted":          "Submitted",
    "approved":           "Approved",
    "rejected":           "Rejected",
    "revision_requested": "Revision Requested",
}

MOOD_LABELS = {1: "Very Poor", 2: "Poor", 3: "Neutral", 4: "Good", 5: "Excellent"}


# ─────────────────────────────────────────────────────────
# Page numbering callback
# ─────────────────────────────────────────────────────────

def _page_footer(canvas, doc):
    rl = _get_rl()
    if not rl:
        return
    from reportlab.lib.colors import Color
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(Color(*GRAY_LIGHT))
    canvas.drawString(
        rl["mm"] * 20,
        rl["mm"] * 12,
        f"Nexus Logbook Export",
    )
    canvas.drawRightString(
        rl["A4"][0] - rl["mm"] * 20,
        rl["mm"] * 12,
        f"Page {doc.page}",
    )
    canvas.restoreState()


# ─────────────────────────────────────────────────────────
# Main PDF generator
# ─────────────────────────────────────────────────────────

def generate_logbook_pdf(logbook) -> bytes:
    """
    Build a full A4 PDF for the given Logbook instance using ReportLab.
    Returns raw PDF bytes.
    Falls back to a plain-text bytes representation if ReportLab is missing.
    """
    rl = _get_rl()
    if not rl:
        return _fallback_text_pdf(logbook)

    from reportlab.lib.colors import Color, HexColor
    from reportlab.platypus import Image as RLImage

    A4      = rl["A4"]
    mm      = rl["mm"]
    colors  = rl["colors"]
    SS      = rl["getSampleStyleSheet"]
    PS      = rl["ParagraphStyle"]
    SDT     = rl["SimpleDocTemplate"]
    Para    = rl["Paragraph"]
    Sp      = rl["Spacer"]
    Tbl     = rl["Table"]
    TS      = rl["TableStyle"]
    HR      = rl["HRFlowable"]
    PB      = rl["PageBreak"]
    KT      = rl["KeepTogether"]
    CENTER  = rl["TA_CENTER"]
    LEFT    = rl["TA_LEFT"]
    RIGHT   = rl["TA_RIGHT"]

    buf = io.BytesIO()

    doc = SDT(
        buf,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=22 * mm,
        bottomMargin=22 * mm,
        title=logbook.title,
        author="Nexus Platform",
    )

    # ── Styles ──────────────────────────────────────────
    base = SS()

    def style(name, parent="Normal", **kw):
        return PS(name, parent=base[parent], **kw)

    s_cover_brand = style("CoverBrand", "Normal",
        fontSize=22, fontName="Helvetica-Bold",
        textColor=Color(*PURPLE), alignment=CENTER, spaceAfter=4)

    s_cover_title = style("CoverTitle", "Normal",
        fontSize=18, fontName="Helvetica-Bold",
        textColor=Color(*GRAY_DARK), alignment=CENTER, spaceAfter=6)

    s_cover_sub = style("CoverSub", "Normal",
        fontSize=11, textColor=Color(*GRAY_LIGHT),
        alignment=CENTER, spaceAfter=4)

    s_section = style("Section", "Normal",
        fontSize=13, fontName="Helvetica-Bold",
        textColor=Color(*PURPLE_DARK), spaceBefore=18, spaceAfter=6)

    s_entry_date = style("EntryDate", "Normal",
        fontSize=11, fontName="Helvetica-Bold",
        textColor=Color(*GRAY_DARK), spaceAfter=3)

    s_field_label = style("FieldLabel", "Normal",
        fontSize=8, fontName="Helvetica-Bold",
        textColor=Color(*GRAY_LIGHT), spaceBefore=6, spaceAfter=2)

    s_field_value = style("FieldValue", "Normal",
        fontSize=10, textColor=Color(*GRAY_MID),
        leading=15, spaceAfter=2)

    s_supervisor = style("Supervisor", "Normal",
        fontSize=10, textColor=Color(*PURPLE),
        leading=15, spaceAfter=2)

    s_small = style("Small", "Normal",
        fontSize=8, textColor=Color(*GRAY_LIGHT), spaceAfter=2)

    s_footer_note = style("FooterNote", "Normal",
        fontSize=9, textColor=Color(*GRAY_LIGHT),
        alignment=CENTER, spaceBefore=12)

    s_normal = style("NX_Normal", "Normal",
        fontSize=10, textColor=Color(*GRAY_MID), spaceAfter=4)

    # ── Helper builders ──────────────────────────────────

    def hr(color=GRAY_BORDER, thickness=0.5):
        return HR(
            width="100%", thickness=thickness,
            color=Color(*color), spaceAfter=4, spaceBefore=4,
        )

    def label(text):
        return Para(text.upper(), s_field_label)

    def value(text):
        if not text:
            return Sp(0, 0)
        return Para(str(text).replace("\n", "<br/>"), s_field_value)

    def stars(n):
        filled = "★" * (n or 0)
        empty  = "☆" * (5 - (n or 0))
        return Para(
            f'<font color="#{int(YELLOW[0]*255):02x}{int(YELLOW[1]*255):02x}{int(YELLOW[2]*255):02x}">'
            f'{filled}</font>{empty}',
            s_field_value,
        )

    def status_badge(status_key):
        fg, bg = STATUS_COLORS.get(status_key, (GRAY_LIGHT, BG_LIGHT))
        label_text = STATUS_LABELS.get(status_key, status_key.upper())
        data = [[Para(label_text,
            PS("BadgeText", parent=base["Normal"],
               fontSize=8, fontName="Helvetica-Bold",
               textColor=Color(*fg)))]]
        tbl = Tbl(data, colWidths=[40 * mm])
        tbl.setStyle(TS([
            ("BACKGROUND", (0, 0), (-1, -1), Color(*bg)),
            ("ROUNDEDCORNERS", [4]),
            ("TOPPADDING",    (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ]))
        return tbl

    def meta_table(rows):
        """Two-column key/value table for cover page."""
        data = [[
            Para(k, PS("MetaKey", parent=base["Normal"],
                       fontSize=10, fontName="Helvetica-Bold",
                       textColor=Color(*GRAY_MID))),
            Para(v, PS("MetaVal", parent=base["Normal"],
                       fontSize=10, textColor=Color(*GRAY_DARK))),
        ] for k, v in rows]
        t = Tbl(data, colWidths=[55 * mm, 95 * mm])
        t.setStyle(TS([
            ("BACKGROUND",    (0, 0), (-1, -1), Color(*WHITE)),
            ("ROWBACKGROUNDS",(0, 0), (-1, -1),
             [Color(*WHITE), Color(*BG_LIGHT)]),
            ("TOPPADDING",    (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LEFTPADDING",   (0, 0), (-1, -1), 10),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
            ("LINEBELOW",     (0, 0), (-1, -1), 0.5, Color(*GRAY_BORDER)),
            ("BOX",           (0, 0), (-1, -1), 0.5, Color(*GRAY_BORDER)),
        ]))
        return t

    def info_box(items, border_color=PURPLE):
        """Shaded key/value box used in entry supervisor block."""
        data = [[
            Para(k, PS("IK", parent=base["Normal"],
                       fontSize=8, fontName="Helvetica-Bold",
                       textColor=Color(*GRAY_LIGHT))),
            Para(v, PS("IV", parent=base["Normal"],
                       fontSize=10, textColor=Color(*GRAY_DARK))),
        ] for k, v in items if v]
        if not data:
            return Sp(0, 0)
        t = Tbl(data, colWidths=[40 * mm, 110 * mm])
        t.setStyle(TS([
            ("BACKGROUND",    (0, 0), (-1, -1), Color(*BG_LIGHT)),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING",   (0, 0), (-1, -1), 10),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
            ("LINEBEFORE",    (0, 0), (0, -1), 3, Color(*border_color)),
        ]))
        return t

    # ── Build content ────────────────────────────────────
    story = []

    # ── COVER PAGE ──────────────────────────────────────
    story.append(Sp(1, 30 * mm))
    story.append(Para("NEXUS", s_cover_brand))
    story.append(Sp(1, 6 * mm))
    story.append(Para(logbook.title, s_cover_title))
    story.append(Para("Internship / Attachment Logbook", s_cover_sub))
    story.append(Sp(1, 10 * mm))
    story.append(hr(PURPLE, thickness=1))
    story.append(Sp(1, 6 * mm))

    intern_name = logbook.intern.get_full_name() if logbook.intern else "—"
    supervisor_name = logbook.supervisor.get_full_name() if logbook.supervisor else "—"
    dept = str(logbook.department) if logbook.department else "—"

    cover_rows = [
        ("Intern",        intern_name),
        ("Email",         logbook.intern.email if logbook.intern else "—"),
        ("Supervisor",    supervisor_name),
        ("Department",    dept),
        ("Period",        f"{logbook.start_date:%d %b %Y}  —  {logbook.end_date:%d %b %Y}"),
        ("Total Entries", str(logbook.total_entries)),
        ("Status",        "Approved" if logbook.final_approved else
                          "Under Review" if logbook.final_submitted else "Active"),
    ]
    story.append(meta_table(cover_rows))
    story.append(Sp(1, 8 * mm))

    if logbook.overall_rating:
        story.append(Para("Overall Rating", s_field_label))
        story.append(stars(logbook.overall_rating))

    story.append(Sp(1, 8 * mm))
    story.append(Para(
        f"Generated: {date.today():%d %B %Y}",
        s_footer_note,
    ))
    story.append(PB())

    # ── SUMMARY PAGE ────────────────────────────────────
    story.append(Para("Summary", s_section))
    story.append(hr())

    from .models import LogbookEntry
    by_status = {
        s: logbook.entries.filter(status=s).count()
        for s, _ in LogbookEntry.Status.choices
    }

    summary_data = [
        [Para("Metric", PS("SH", parent=base["Normal"],
              fontSize=9, fontName="Helvetica-Bold", textColor=Color(*GRAY_MID))),
         Para("Value",  PS("SH2", parent=base["Normal"],
              fontSize=9, fontName="Helvetica-Bold", textColor=Color(*GRAY_MID)))],
        ["Total Entries",          str(logbook.total_entries)],
        ["Approved Entries",       str(logbook.approved_entries)],
        ["Completion",             f"{logbook.completion_percentage}%"],
        ["Draft",                  str(by_status.get("draft", 0))],
        ["Submitted (pending)",    str(by_status.get("submitted", 0))],
        ["Rejected",               str(by_status.get("rejected", 0))],
        ["Revision Requested",     str(by_status.get("revision_requested", 0))],
        ["Final Submitted",        logbook.final_submitted_at.strftime("%d %b %Y")
                                   if logbook.final_submitted_at else "No"],
        ["Final Approved",         logbook.final_approved_at.strftime("%d %b %Y")
                                   if logbook.final_approved_at else "No"],
        ["Intern Signed",          logbook.intern_signed_at.strftime("%d %b %Y")
                                   if logbook.intern_signed_at else "Pending"],
        ["Supervisor Signed",      logbook.supervisor_signed_at.strftime("%d %b %Y")
                                   if logbook.supervisor_signed_at else "Pending"],
    ]

    sum_tbl = Tbl(summary_data, colWidths=[100 * mm, 60 * mm])
    sum_tbl.setStyle(TS([
        ("BACKGROUND",    (0, 0), (-1, 0),  Color(*PURPLE_DARK)),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  Color(*WHITE)),
        ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0),  9),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1),
         [Color(*WHITE), Color(*BG_LIGHT)]),
        ("FONTSIZE",      (0, 1), (-1, -1), 10),
        ("TOPPADDING",    (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
        ("BOX",           (0, 0), (-1, -1), 0.5, Color(*GRAY_BORDER)),
        ("LINEBELOW",     (0, 0), (-1, -1), 0.5, Color(*GRAY_BORDER)),
    ]))
    story.append(sum_tbl)

    if logbook.overall_comments:
        story.append(Sp(1, 6 * mm))
        story.append(label("Supervisor Final Comments"))
        story.append(info_box([("Comments", logbook.overall_comments)]))

    story.append(PB())

    # ── ENTRIES ─────────────────────────────────────────
    story.append(Para("Daily Entries", s_section))
    story.append(hr())

    entries = logbook.entries.order_by("date").prefetch_related(
        "attachments", "reviewed_by"
    )

    for entry in entries:
        block = []

        # Entry header row: date left, badge right
        header_data = [[
            Para(entry.date.strftime("%A, %d %B %Y"), s_entry_date),
            status_badge(entry.status),
        ]]
        header_tbl = Tbl(header_data, colWidths=[110 * mm, 50 * mm])
        header_tbl.setStyle(TS([
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            ("TOPPADDING",    (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("ALIGN",         (1, 0), (1, 0),   "RIGHT"),
        ]))
        block.append(header_tbl)

        # Meta row (location, times, hours, mood)
        meta_parts = []
        if entry.location:
            meta_parts.append(f"Location: {entry.location}")
        if entry.reporting_time:
            meta_parts.append(f"In: {entry.reporting_time:%H:%M}")
        if entry.closing_time:
            meta_parts.append(f"Out: {entry.closing_time:%H:%M}")
        if entry.hours_worked:
            meta_parts.append(f"Hours: {entry.hours_worked}")
        if entry.mood_rating:
            meta_parts.append(f"Mood: {MOOD_LABELS.get(entry.mood_rating, '')}")
        if meta_parts:
            block.append(Para("  ·  ".join(meta_parts), s_small))

        block.append(hr(GRAY_BORDER, 0.3))

        # Content fields
        block.append(label("Activities & Tasks Completed"))
        block.append(value(entry.activities))

        if entry.skills_acquired:
            block.append(label("Skills Acquired"))
            block.append(value(entry.skills_acquired))

        if entry.challenges:
            block.append(label("Challenges Faced"))
            block.append(value(entry.challenges))

        if entry.reflection:
            block.append(label("Reflection"))
            block.append(value(entry.reflection))

        att_count = entry.attachments.count()
        if att_count:
            names = ", ".join(
                a.original_name for a in entry.attachments.all()
            )
            block.append(label(f"Attachments ({att_count})"))
            block.append(Para(names, s_small))

        # Supervisor review block
        if entry.supervisor_comments or entry.supervisor_rating:
            block.append(Sp(1, 3 * mm))
            sv_items = []
            if entry.supervisor_rating:
                sv_items.append(("Rating",   "★" * entry.supervisor_rating + "☆" * (5 - entry.supervisor_rating)))
            if entry.supervisor_comments:
                sv_items.append(("Comments", entry.supervisor_comments))
            if entry.reviewed_by:
                sv_items.append((
                    "Reviewed by",
                    f"{entry.reviewed_by.get_full_name()}  ·  "
                    f"{entry.reviewed_at:%d %b %Y, %H:%M}"
                    if entry.reviewed_at else entry.reviewed_by.get_full_name()
                ))
            if sv_items:
                block.append(info_box(sv_items, border_color=PURPLE))

        block.append(Sp(1, 3 * mm))
        block.append(hr(GRAY_BORDER, 0.3))
        block.append(Sp(1, 4 * mm))

        story.append(KT(block))

    # ── SIGNATURES PAGE ──────────────────────────────────
    story.append(PB())
    story.append(Para("Digital Signatures", s_section))
    story.append(hr())
    story.append(Sp(1, 6 * mm))

    def sig_cell(role_label, name, signed_at):
        lines = [
            Para(role_label, PS("SigRole", parent=base["Normal"],
                fontSize=8, fontName="Helvetica-Bold",
                textColor=Color(*GRAY_LIGHT), alignment=CENTER)),
            Sp(1, 20 * mm),   # space where signature image would go
            HR(width="80%", thickness=0.8,
               color=Color(*GRAY_MID), spaceAfter=4, spaceBefore=0),
            Para(name, PS("SigName", parent=base["Normal"],
                 fontSize=10, fontName="Helvetica-Bold",
                 textColor=Color(*GRAY_DARK), alignment=CENTER)),
            Para(
                signed_at.strftime("Signed: %d %B %Y") if signed_at else "Not yet signed",
                PS("SigDate", parent=base["Normal"],
                   fontSize=8, textColor=Color(*GRAY_LIGHT), alignment=CENTER),
            ),
        ]
        return lines

    intern_lines = sig_cell(
        "INTERN SIGNATURE",
        intern_name,
        logbook.intern_signed_at,
    )
    supervisor_lines = sig_cell(
        "SUPERVISOR SIGNATURE",
        supervisor_name,
        logbook.supervisor_signed_at,
    )

    sig_data = [[intern_lines, supervisor_lines]]
    sig_tbl = Tbl(sig_data, colWidths=[80 * mm, 80 * mm])
    sig_tbl.setStyle(TS([
        ("BOX",           (0, 0), (0, 0), 0.5, Color(*GRAY_BORDER)),
        ("BOX",           (1, 0), (1, 0), 0.5, Color(*GRAY_BORDER)),
        ("LEFTPADDING",   (0, 0), (-1, -1), 12),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
        ("TOPPADDING",    (0, 0), (-1, -1), 14),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(sig_tbl)

    if logbook.final_approved:
        story.append(Sp(1, 10 * mm))
        stamp_data = [[Para(
            f"OFFICIALLY APPROVED\n"
            f"{logbook.final_approved_by.get_full_name() if logbook.final_approved_by else ''}  ·  "
            f"{logbook.final_approved_at:%d %B %Y}" if logbook.final_approved_at else "",
            PS("Stamp", parent=base["Normal"],
               fontSize=12, fontName="Helvetica-Bold",
               textColor=Color(*GREEN), alignment=CENTER),
        )]]
        stamp = Tbl(stamp_data, colWidths=[160 * mm])
        stamp.setStyle(TS([
            ("BOX",           (0, 0), (-1, -1), 2, Color(*GREEN)),
            ("BACKGROUND",    (0, 0), (-1, -1),
             Color(0xf0/255, 0xfd/255, 0xf4/255)),
            ("TOPPADDING",    (0, 0), (-1, -1), 14),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
        ]))
        story.append(stamp)

    # ── Build PDF ────────────────────────────────────────
    doc.build(story, onFirstPage=_page_footer, onLaterPages=_page_footer)
    return buf.getvalue()


def _fallback_text_pdf(logbook) -> bytes:
    """Plaintext fallback if ReportLab is not installed."""
    lines = [
        "NEXUS — LOGBOOK EXPORT",
        "=" * 60,
        f"Title:      {logbook.title}",
        f"Intern:     {logbook.intern}",
        f"Supervisor: {logbook.supervisor or '—'}",
        f"Period:     {logbook.start_date} — {logbook.end_date}",
        f"Entries:    {logbook.total_entries}",
        "",
    ]
    for entry in logbook.entries.order_by("date"):
        lines += [
            "-" * 60,
            f"Date: {entry.date}  |  Status: {entry.status}",
            f"Activities: {entry.activities}",
        ]
        if entry.supervisor_comments:
            lines.append(f"Supervisor: {entry.supervisor_comments}")
        lines.append("")
    return "\n".join(lines).encode("utf-8")


# ─────────────────────────────────────────────────────────
# Public notification API
# ─────────────────────────────────────────────────────────

class LogbookService:

    @staticmethod
    def generate_pdf(logbook, request=None) -> bytes:
        return generate_logbook_pdf(logbook)

    @staticmethod
    def notify_supervisor_entry_submitted(entry):
        sv = entry.logbook.supervisor
        if not sv:
            return
        _send(
            sv.email,
            f"[Nexus] New logbook entry — {entry.logbook.intern.get_full_name()}",
            (
                f"Hi {sv.get_full_name()},\n\n"
                f"{entry.logbook.intern.get_full_name()} submitted a logbook entry "
                f"for {entry.date:%d %b %Y} (Logbook: {entry.logbook.title}).\n\n"
                f"Please log in to Nexus to review it.\n\n"
                f"— Nexus"
            ),
        )

    @staticmethod
    def notify_intern_entry_approved(entry):
        intern = entry.logbook.intern
        _send(
            intern.email,
            f"[Nexus] Entry approved — {entry.date:%d %b %Y}",
            (
                f"Hi {intern.get_full_name()},\n\n"
                f"Your logbook entry for {entry.date:%d %b %Y} has been approved.\n"
                + (f"\nSupervisor comments: {entry.supervisor_comments}\n"
                   if entry.supervisor_comments else "")
                + (f"Rating: {entry.supervisor_rating}/5\n"
                   if entry.supervisor_rating else "")
                + f"\n— Nexus"
            ),
        )

    @staticmethod
    def notify_intern_entry_rejected(entry):
        intern = entry.logbook.intern
        _send(
            intern.email,
            f"[Nexus] Entry rejected — {entry.date:%d %b %Y}",
            (
                f"Hi {intern.get_full_name()},\n\n"
                f"Your logbook entry for {entry.date:%d %b %Y} has been rejected.\n"
                + (f"\nReason: {entry.supervisor_comments}\n"
                   if entry.supervisor_comments else "")
                + f"\nPlease update and resubmit.\n\n— Nexus"
            ),
        )

    @staticmethod
    def notify_intern_revision_requested(entry):
        intern = entry.logbook.intern
        _send(
            intern.email,
            f"[Nexus] Revision requested — {entry.date:%d %b %Y}",
            (
                f"Hi {intern.get_full_name()},\n\n"
                f"Your supervisor has requested a revision for your entry "
                f"on {entry.date:%d %b %Y}.\n"
                + (f"\nWhat to revise: {entry.supervisor_comments}\n"
                   if entry.supervisor_comments else "")
                + f"\n— Nexus"
            ),
        )

    @staticmethod
    def notify_supervisor_final_submission(lb):
        sv = lb.supervisor
        if not sv:
            return
        _send(
            sv.email,
            f"[Nexus] Final logbook submission — {lb.intern.get_full_name()}",
            (
                f"Hi {sv.get_full_name()},\n\n"
                f"{lb.intern.get_full_name()} has submitted their logbook "
                f"'{lb.title}' for final approval.\n\n"
                f"Period: {lb.start_date:%d %b %Y} — {lb.end_date:%d %b %Y}\n"
                f"Total entries: {lb.total_entries}\n\n"
                f"Please log in to Nexus to review and approve.\n\n— Nexus"
            ),
        )

    @staticmethod
    def notify_intern_final_approval(lb):
        intern = lb.intern
        _send(
            intern.email,
            "[Nexus] Your logbook has been approved!",
            (
                f"Hi {intern.get_full_name()},\n\n"
                f"Congratulations! Your logbook '{lb.title}' has been finally approved.\n\n"
                + (f"Overall rating: {lb.overall_rating}/5\n"
                   if lb.overall_rating else "")
                + (f"Comments: {lb.overall_comments}\n"
                   if lb.overall_comments else "")
                + f"\nApproved by: {lb.final_approved_by.get_full_name() if lb.final_approved_by else '—'}\n"
                f"Date: {lb.final_approved_at:%d %b %Y}\n\n— Nexus"
            ),
        )

    @staticmethod
    def notify_attachee_program_activated(logbook):
        """
        Sent to an attachee the moment their department is activated
        within a cohort and their Logbook is auto-created for them.
        """
        intern = logbook.intern
        if not intern or not intern.email:
            return
        supervisor_name = (
            logbook.supervisor.get_full_name() if logbook.supervisor else "your supervisor"
        )
        _send(
            intern.email,
            f"[Nexus] Your logbook is now open — {logbook.title}",
            (
                f"Hi {intern.get_full_name()},\n\n"
                f"Your logbook for '{logbook.title}' is now active.\n\n"
                f"Period: {logbook.start_date:%d %b %Y} — {logbook.end_date:%d %b %Y}\n"
                f"Supervisor: {supervisor_name}\n\n"
                f"You can fill in today's entry once you log in to Nexus. Note that "
                f"each daily entry can only be created or edited on its own day — "
                f"once midnight passes it locks automatically.\n\n— Nexus"
            ),
        )
