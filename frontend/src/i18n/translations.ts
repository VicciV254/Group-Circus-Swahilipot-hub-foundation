// src/i18n/translations.ts
// Nexus Enterprise — UI translations for 6 languages

export type LangCode = "en" | "sw" | "fr" | "ar" | "es" | "pt";

export const LANGUAGES: {
	code: LangCode;
	label: string;
	nativeLabel: string;
	flag: string;
	rtl?: boolean;
}[] = [
	{ code: "en", label: "English", nativeLabel: "English", flag: "🇬🇧" },
	{ code: "sw", label: "Swahili", nativeLabel: "Kiswahili", flag: "🇰🇪" },
	{ code: "fr", label: "French", nativeLabel: "Français", flag: "🇫🇷" },
	{
		code: "ar",
		label: "Arabic",
		nativeLabel: "العربية",
		flag: "🇸🇦",
		rtl: true,
	},
	{ code: "es", label: "Spanish", nativeLabel: "Español", flag: "🇪🇸" },
	{ code: "pt", label: "Portuguese", nativeLabel: "Português", flag: "🇵🇹" },
];

export type TranslationKey =
	// ── Nav ────────────────────────────────────────────────────────────────────
	| "nav.dashboard"
	| "nav.internship"
	| "nav.attachees"
	| "nav.attendance"
	| "nav.tasks"
	| "nav.logbooks"
	| "nav.evaluations"
	| "nav.certificates"
	| "nav.broadcast"
	| "nav.equipment"
	| "nav.projects"
	| "nav.fm_station"
	| "nav.radio_schedule"
	| "nav.news_cms"
	| "nav.videography"
	| "nav.calls"
	| "nav.digital_services"
	| "nav.software_licences"
	| "nav.wifi_access"
	| "nav.file_transfer"
	| "nav.feedback"
	| "nav.enterprise"
	| "nav.analytics"
	| "nav.hr"
	| "nav.finance"
	| "nav.user_management"
	| "nav.notifications"
	| "nav.emergency_alert"
	| "nav.settings"
	// ── Topbar / user menu ──────────────────────────────────────────────────────
	| "menu.my_profile"
	| "menu.accessibility"
	| "menu.preferences"
	| "menu.settings"
	| "menu.logout"
	| "menu.organisation"
	// ── Accessibility modal ─────────────────────────────────────────────────────
	| "a11y.title"
	| "a11y.subtitle"
	| "a11y.font_type"
	| "a11y.language"
	| "a11y.language_subtitle"
	| "a11y.save"
	| "a11y.saving"
	| "a11y.cancel"
	| "a11y.saved_toast"
	| "a11y.save_error"
	// ── Font names ───────────────────────────────────────────────────────────────
	| "font.default"
	| "font.default_desc"
	| "font.dyslexic"
	| "font.dyslexic_desc"
	| "font.mono"
	| "font.mono_desc"
	| "font.serif"
	| "font.serif_desc"
	// ── Preferences modal ────────────────────────────────────────────────────────
	| "pref.title"
	| "pref.subtitle"
	| "pref.theme"
	| "pref.theme_dark"
	| "pref.theme_light"
	| "pref.done"
	| "pref.coming_soon"
	// ── Common ───────────────────────────────────────────────────────────────────
	| "common.alerts"
	| "common.alert"
	| "common.logged_out"
	| "notif.empty"
	| "notif.see_all"
	| "notif.mark_all_read";

export type Translations = Record<TranslationKey, string>;

const en: Translations = {
	"nav.dashboard": "Dashboard",
	"nav.internship": "Internship",
	"nav.attachees": "Attachees",
	"nav.attendance": "Attendance",
	"nav.tasks": "Tasks",
	"nav.logbooks": "Logbooks",
	"nav.evaluations": "Evaluations",
	"nav.certificates": "Certificates",
	"nav.broadcast": "Broadcast",
	"nav.equipment": "Equipment",
	"nav.projects": "Projects",
	"nav.fm_station": "FM Station",
	"nav.radio_schedule": "Radio Schedule",
	"nav.news_cms": "News CMS",
	"nav.videography": "Videography",
	"nav.calls": "Calls",
	"nav.digital_services": "Digital Services",
	"nav.software_licences": "Software Licences",
	"nav.wifi_access": "Wi-Fi Access",
	"nav.file_transfer": "File Transfer",
	"nav.feedback": "Feedback / Tickets",
	"nav.enterprise": "Enterprise",
	"nav.analytics": "Analytics",
	"nav.hr": "HR",
	"nav.finance": "Finance",
	"nav.user_management": "User Management",
	"nav.notifications": "Notifications",
	"nav.emergency_alert": "🚨 Emergency Alert",
	"nav.settings": "Settings",
	"menu.my_profile": "My Profile",
	"menu.accessibility": "Accessibility",
	"menu.preferences": "Preferences",
	"menu.settings": "Settings",
	"menu.logout": "Logout",
	"menu.organisation": "Organisation",
	"a11y.title": "Accessibility",
	"a11y.subtitle": "Synced across all your devices",
	"a11y.font_type": "Font type",
	"a11y.language": "Language",
	"a11y.language_subtitle": "Choose your display language",
	"a11y.save": "Save changes",
	"a11y.saving": "Saving…",
	"a11y.cancel": "Cancel",
	"a11y.saved_toast": "Accessibility settings successfully saved",
	"a11y.save_error": "Failed to save — please try again",
	"font.default": "Default",
	"font.default_desc": "System default — clean and neutral",
	"font.dyslexic": "Dyslexic-friendly",
	"font.dyslexic_desc": "OpenDyslexic — optimised for readability",
	"font.mono": "Monospace",
	"font.mono_desc": "JetBrains Mono — precise and structured",
	"font.serif": "Serif",
	"font.serif_desc": "Georgia — traditional and readable",
	"pref.title": "Preferences",
	"pref.subtitle": "Appearance & display settings",
	"pref.theme": "Theme",
	"pref.theme_dark": "Dark mode active",
	"pref.theme_light": "Light mode active",
	"pref.done": "Done",
	"pref.coming_soon": "More preferences will be available in a future update.",
	"common.alerts": "Alerts",
	"common.alert": "Alert",
	"common.logged_out": "Logged out successfully",
	"notif.empty": "You have no notifications",
	"notif.see_all": "See all",
	"notif.mark_all_read": "All notifications marked as read",
};

const sw: Translations = {
	"nav.dashboard": "Dashibodi",
	"nav.internship": "Mafunzo",
	"nav.attachees": "Wanafunzi",
	"nav.attendance": "Mahudhurio",
	"nav.tasks": "Kazi",
	"nav.logbooks": "Vitabu vya Kazi",
	"nav.evaluations": "Tathmini",
	"nav.certificates": "Vyeti",
	"nav.broadcast": "Utangazaji",
	"nav.equipment": "Vifaa",
	"nav.projects": "Miradi",
	"nav.fm_station": "Kituo cha FM",
	"nav.radio_schedule": "Ratiba ya Redio",
	"nav.news_cms": "Mfumo wa Habari",
	"nav.videography": "Utengenezaji Video",
	"nav.calls": "Simu",
	"nav.digital_services": "Huduma za Kidijitali",
	"nav.software_licences": "Leseni za Programu",
	"nav.wifi_access": "Ufikiaji wa Wi-Fi",
	"nav.file_transfer": "Uhamishaji Faili",
	"nav.feedback": "Maoni / Tiketi",
	"nav.enterprise": "Biashara",
	"nav.analytics": "Uchambuzi",
	"nav.hr": "Rasilimali Watu",
	"nav.finance": "Fedha",
	"nav.user_management": "Usimamizi wa Watumiaji",
	"nav.notifications": "Arifa",
	"nav.emergency_alert": "🚨 Tahadhari ya Dharura",
	"nav.settings": "Mipangilio",
	"menu.my_profile": "Wasifu Wangu",
	"menu.accessibility": "Ufikiaji",
	"menu.preferences": "Mapendeleo",
	"menu.settings": "Mipangilio",
	"menu.logout": "Toka",
	"menu.organisation": "Shirika",
	"a11y.title": "Ufikiaji",
	"a11y.subtitle": "Inapatikana kwenye vifaa vyako vyote",
	"a11y.font_type": "Aina ya Fonti",
	"a11y.language": "Lugha",
	"a11y.language_subtitle": "Chagua lugha ya onyesho",
	"a11y.save": "Hifadhi Mabadiliko",
	"a11y.saving": "Inahifadhi…",
	"a11y.cancel": "Ghairi",
	"a11y.saved_toast": "Mipangilio ya ufikiaji imehifadhiwa",
	"a11y.save_error": "Imeshindwa kuhifadhi — jaribu tena",
	"font.default": "Chaguomsingi",
	"font.default_desc": "Fonti ya mfumo — safi na wastani",
	"font.dyslexic": "Rafiki kwa Dyslexia",
	"font.dyslexic_desc": "OpenDyslexic — imebuniwa kwa usomaji",
	"font.mono": "Monospace",
	"font.mono_desc": "JetBrains Mono — sahihi na iliyopangwa",
	"font.serif": "Serif",
	"font.serif_desc": "Georgia — ya kitamaduni na inayosomeka",
	"pref.title": "Mapendeleo",
	"pref.subtitle": "Mipangilio ya muonekano",
	"pref.theme": "Mandhari",
	"pref.theme_dark": "Hali ya giza imewashwa",
	"pref.theme_light": "Hali ya mwanga imewashwa",
	"pref.done": "Imekamilika",
	"pref.coming_soon": "Mapendeleo zaidi yatapatikana baadaye.",
	"common.alerts": "Tahadhari",
	"common.alert": "Tahadhari",
	"common.logged_out": "Umetoka kwa mafanikio",
	"notif.empty": "Huna arifa",
	"notif.see_all": "Ona zote",
	"notif.mark_all_read": "Arifa zote zimesomwa",
};

const fr: Translations = {
	"nav.dashboard": "Tableau de bord",
	"nav.internship": "Stage",
	"nav.attachees": "Stagiaires",
	"nav.attendance": "Présence",
	"nav.tasks": "Tâches",
	"nav.logbooks": "Journaux de bord",
	"nav.evaluations": "Évaluations",
	"nav.certificates": "Certificats",
	"nav.broadcast": "Diffusion",
	"nav.equipment": "Équipement",
	"nav.projects": "Projets",
	"nav.fm_station": "Station FM",
	"nav.radio_schedule": "Programme Radio",
	"nav.news_cms": "CMS Actualités",
	"nav.videography": "Vidéographie",
	"nav.calls": "Appels",
	"nav.digital_services": "Services Numériques",
	"nav.software_licences": "Licences Logicielles",
	"nav.wifi_access": "Accès Wi-Fi",
	"nav.file_transfer": "Transfert de Fichiers",
	"nav.feedback": "Retours / Tickets",
	"nav.enterprise": "Entreprise",
	"nav.analytics": "Analytique",
	"nav.hr": "RH",
	"nav.finance": "Finance",
	"nav.user_management": "Gestion des Utilisateurs",
	"nav.notifications": "Notifications",
	"nav.emergency_alert": "🚨 Alerte d'Urgence",
	"nav.settings": "Paramètres",
	"menu.my_profile": "Mon Profil",
	"menu.accessibility": "Accessibilité",
	"menu.preferences": "Préférences",
	"menu.settings": "Paramètres",
	"menu.logout": "Déconnexion",
	"menu.organisation": "Organisation",
	"a11y.title": "Accessibilité",
	"a11y.subtitle": "Synchronisé sur tous vos appareils",
	"a11y.font_type": "Type de police",
	"a11y.language": "Langue",
	"a11y.language_subtitle": "Choisissez votre langue d'affichage",
	"a11y.save": "Enregistrer",
	"a11y.saving": "Enregistrement…",
	"a11y.cancel": "Annuler",
	"a11y.saved_toast": "Paramètres d'accessibilité enregistrés",
	"a11y.save_error": "Échec de l'enregistrement — réessayez",
	"font.default": "Par défaut",
	"font.default_desc": "Police système — propre et neutre",
	"font.dyslexic": "Adapté à la dyslexie",
	"font.dyslexic_desc": "OpenDyslexic — optimisé pour la lisibilité",
	"font.mono": "Monospace",
	"font.mono_desc": "JetBrains Mono — précis et structuré",
	"font.serif": "Serif",
	"font.serif_desc": "Georgia — traditionnel et lisible",
	"pref.title": "Préférences",
	"pref.subtitle": "Paramètres d'apparence",
	"pref.theme": "Thème",
	"pref.theme_dark": "Mode sombre activé",
	"pref.theme_light": "Mode clair activé",
	"pref.done": "Terminé",
	"pref.coming_soon": "Plus de préférences disponibles prochainement.",
	"common.alerts": "Alertes",
	"common.alert": "Alerte",
	"common.logged_out": "Déconnecté avec succès",
	"notif.empty": "Vous n'avez aucune notification",
	"notif.see_all": "Voir tout",
	"notif.mark_all_read": "Toutes les notifications marquées comme lues",
};

const ar: Translations = {
	"nav.dashboard": "لوحة التحكم",
	"nav.internship": "التدريب",
	"nav.attachees": "المتدربون",
	"nav.attendance": "الحضور",
	"nav.tasks": "المهام",
	"nav.logbooks": "سجلات العمل",
	"nav.evaluations": "التقييمات",
	"nav.certificates": "الشهادات",
	"nav.broadcast": "البث",
	"nav.equipment": "المعدات",
	"nav.projects": "المشاريع",
	"nav.fm_station": "محطة FM",
	"nav.radio_schedule": "جدول الراديو",
	"nav.news_cms": "نظام الأخبار",
	"nav.videography": "التصوير",
	"nav.calls": "المكالمات",
	"nav.digital_services": "الخدمات الرقمية",
	"nav.software_licences": "تراخيص البرامج",
	"nav.wifi_access": "الوصول للواي فاي",
	"nav.file_transfer": "نقل الملفات",
	"nav.feedback": "الملاحظات / التذاكر",
	"nav.enterprise": "المؤسسة",
	"nav.analytics": "التحليلات",
	"nav.hr": "الموارد البشرية",
	"nav.finance": "المالية",
	"nav.user_management": "إدارة المستخدمين",
	"nav.notifications": "الإشعارات",
	"nav.emergency_alert": "🚨 تنبيه طارئ",
	"nav.settings": "الإعدادات",
	"menu.my_profile": "ملفي الشخصي",
	"menu.accessibility": "إمكانية الوصول",
	"menu.preferences": "التفضيلات",
	"menu.settings": "الإعدادات",
	"menu.logout": "تسجيل الخروج",
	"menu.organisation": "المنظمة",
	"a11y.title": "إمكانية الوصول",
	"a11y.subtitle": "متزامن عبر جميع أجهزتك",
	"a11y.font_type": "نوع الخط",
	"a11y.language": "اللغة",
	"a11y.language_subtitle": "اختر لغة العرض",
	"a11y.save": "حفظ التغييرات",
	"a11y.saving": "جارٍ الحفظ…",
	"a11y.cancel": "إلغاء",
	"a11y.saved_toast": "تم حفظ إعدادات إمكانية الوصول",
	"a11y.save_error": "فشل الحفظ — يرجى المحاولة مرة أخرى",
	"font.default": "افتراضي",
	"font.default_desc": "خط النظام — نظيف ومحايد",
	"font.dyslexic": "مناسب لعسر القراءة",
	"font.dyslexic_desc": "OpenDyslexic — محسّن للقراءة",
	"font.mono": "أحادي المسافة",
	"font.mono_desc": "JetBrains Mono — دقيق ومنظم",
	"font.serif": "مزخرف",
	"font.serif_desc": "Georgia — تقليدي وسهل القراءة",
	"pref.title": "التفضيلات",
	"pref.subtitle": "إعدادات المظهر والعرض",
	"pref.theme": "السمة",
	"pref.theme_dark": "الوضع الداكن مفعّل",
	"pref.theme_light": "الوضع الفاتح مفعّل",
	"pref.done": "تم",
	"pref.coming_soon": "المزيد من التفضيلات ستتوفر قريباً.",
	"common.alerts": "تنبيهات",
	"common.alert": "تنبيه",
	"common.logged_out": "تم تسجيل الخروج بنجاح",
	"notif.empty": "لا توجد إشعارات",
	"notif.see_all": "عرض الكل",
	"notif.mark_all_read": "تم تعليم جميع الإشعارات كمقروءة",
};

const es: Translations = {
	"nav.dashboard": "Panel de Control",
	"nav.internship": "Pasantía",
	"nav.attachees": "Pasantes",
	"nav.attendance": "Asistencia",
	"nav.tasks": "Tareas",
	"nav.logbooks": "Bitácoras",
	"nav.evaluations": "Evaluaciones",
	"nav.certificates": "Certificados",
	"nav.broadcast": "Transmisión",
	"nav.equipment": "Equipamiento",
	"nav.projects": "Proyectos",
	"nav.fm_station": "Estación FM",
	"nav.radio_schedule": "Programación de Radio",
	"nav.news_cms": "CMS de Noticias",
	"nav.videography": "Videografía",
	"nav.calls": "Llamadas",
	"nav.digital_services": "Servicios Digitales",
	"nav.software_licences": "Licencias de Software",
	"nav.wifi_access": "Acceso Wi-Fi",
	"nav.file_transfer": "Transferencia de Archivos",
	"nav.feedback": "Comentarios / Tickets",
	"nav.enterprise": "Empresa",
	"nav.analytics": "Analítica",
	"nav.hr": "RRHH",
	"nav.finance": "Finanzas",
	"nav.user_management": "Gestión de Usuarios",
	"nav.notifications": "Notificaciones",
	"nav.emergency_alert": "🚨 Alerta de Emergencia",
	"nav.settings": "Configuración",
	"menu.my_profile": "Mi Perfil",
	"menu.accessibility": "Accesibilidad",
	"menu.preferences": "Preferencias",
	"menu.settings": "Configuración",
	"menu.logout": "Cerrar Sesión",
	"menu.organisation": "Organización",
	"a11y.title": "Accesibilidad",
	"a11y.subtitle": "Sincronizado en todos tus dispositivos",
	"a11y.font_type": "Tipo de fuente",
	"a11y.language": "Idioma",
	"a11y.language_subtitle": "Elige tu idioma de visualización",
	"a11y.save": "Guardar cambios",
	"a11y.saving": "Guardando…",
	"a11y.cancel": "Cancelar",
	"a11y.saved_toast": "Configuración de accesibilidad guardada",
	"a11y.save_error": "Error al guardar — inténtalo de nuevo",
	"font.default": "Predeterminada",
	"font.default_desc": "Fuente del sistema — limpia y neutral",
	"font.dyslexic": "Amigable para dislexia",
	"font.dyslexic_desc": "OpenDyslexic — optimizado para legibilidad",
	"font.mono": "Monoespaciada",
	"font.mono_desc": "JetBrains Mono — precisa y estructurada",
	"font.serif": "Serif",
	"font.serif_desc": "Georgia — tradicional y legible",
	"pref.title": "Preferencias",
	"pref.subtitle": "Configuración de apariencia",
	"pref.theme": "Tema",
	"pref.theme_dark": "Modo oscuro activo",
	"pref.theme_light": "Modo claro activo",
	"pref.done": "Hecho",
	"pref.coming_soon": "Más preferencias disponibles próximamente.",
	"common.alerts": "Alertas",
	"common.alert": "Alerta",
	"common.logged_out": "Sesión cerrada exitosamente",
	"notif.empty": "No tienes notificaciones",
	"notif.see_all": "Ver todo",
	"notif.mark_all_read": "Todas las notificaciones marcadas como leídas",
};

const pt: Translations = {
	"nav.dashboard": "Painel de Controle",
	"nav.internship": "Estágio",
	"nav.attachees": "Estagiários",
	"nav.attendance": "Presença",
	"nav.tasks": "Tarefas",
	"nav.logbooks": "Diários de Bordo",
	"nav.evaluations": "Avaliações",
	"nav.certificates": "Certificados",
	"nav.broadcast": "Transmissão",
	"nav.equipment": "Equipamentos",
	"nav.projects": "Projetos",
	"nav.fm_station": "Estação FM",
	"nav.radio_schedule": "Programação de Rádio",
	"nav.news_cms": "CMS de Notícias",
	"nav.videography": "Videografia",
	"nav.calls": "Chamadas",
	"nav.digital_services": "Serviços Digitais",
	"nav.software_licences": "Licenças de Software",
	"nav.wifi_access": "Acesso Wi-Fi",
	"nav.file_transfer": "Transferência de Arquivos",
	"nav.feedback": "Feedback / Tickets",
	"nav.enterprise": "Empresa",
	"nav.analytics": "Análises",
	"nav.hr": "RH",
	"nav.finance": "Finanças",
	"nav.user_management": "Gestão de Utilizadores",
	"nav.notifications": "Notificações",
	"nav.emergency_alert": "🚨 Alerta de Emergência",
	"nav.settings": "Definições",
	"menu.my_profile": "Meu Perfil",
	"menu.accessibility": "Acessibilidade",
	"menu.preferences": "Preferências",
	"menu.settings": "Definições",
	"menu.logout": "Terminar Sessão",
	"menu.organisation": "Organização",
	"a11y.title": "Acessibilidade",
	"a11y.subtitle": "Sincronizado em todos os seus dispositivos",
	"a11y.font_type": "Tipo de letra",
	"a11y.language": "Idioma",
	"a11y.language_subtitle": "Escolha o seu idioma de exibição",
	"a11y.save": "Guardar alterações",
	"a11y.saving": "A guardar…",
	"a11y.cancel": "Cancelar",
	"a11y.saved_toast": "Definições de acessibilidade guardadas",
	"a11y.save_error": "Erro ao guardar — tente novamente",
	"font.default": "Predefinida",
	"font.default_desc": "Letra do sistema — limpa e neutra",
	"font.dyslexic": "Amigável para dislexia",
	"font.dyslexic_desc": "OpenDyslexic — optimizado para leitura",
	"font.mono": "Monospace",
	"font.mono_desc": "JetBrains Mono — preciso e estruturado",
	"font.serif": "Serifada",
	"font.serif_desc": "Georgia — tradicional e legível",
	"pref.title": "Preferências",
	"pref.subtitle": "Definições de aparência",
	"pref.theme": "Tema",
	"pref.theme_dark": "Modo escuro ativo",
	"pref.theme_light": "Modo claro ativo",
	"pref.done": "Concluído",
	"pref.coming_soon": "Mais preferências disponíveis em breve.",
	"common.alerts": "Alertas",
	"common.alert": "Alerta",
	"common.logged_out": "Sessão terminada com sucesso",
	"notif.empty": "Não tens notificações",
	"notif.see_all": "Ver tudo",
	"notif.mark_all_read": "Todas as notificações marcadas como lidas",
};

export const TRANSLATIONS: Record<LangCode, Translations> = {
	en,
	sw,
	fr,
	ar,
	es,
	pt,
};
