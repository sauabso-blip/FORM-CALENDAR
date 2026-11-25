window.AppUtils = {
    getDaysInMonth: function(year, month) {
        return new Date(year, month + 1, 0).getDate();
    },

    formatDateDisplay: function(dateStr) {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    },

    /**
     * Devuelve el número de semana ISO-8601 (1 a 53) y el año correspondiente.
     * La semana 1 es la que contiene el 4 de enero o el primer jueves del año.
     */
    getISOWeekNumber: function(date) {
        const d = (date instanceof Date) ? new Date(date.getTime()) : new Date(date + 'T00:00:00');
        // Día de la semana (1 = Lunes, 7 = Domingo)
        const dayNr = (d.getDay() + 6) % 7 + 1;
        // Ajustar al jueves de la semana actual
        d.setDate(d.getDate() - dayNr + 4);
        const jan4 = new Date(d.getFullYear(), 0, 4);
        const dayDiff = (d - jan4) / 86400000;
        const weekNo = 1 + Math.round(dayDiff / 7);
        return { week: weekNo, year: d.getFullYear() };
    },

    /**
     * Devuelve las fechas (Date) de Lunes a Domingo para la semana que contiene `date`.
     */
    getWeekDays: function(date) {
        const d = (date instanceof Date) ? new Date(date.getTime()) : new Date(date + 'T00:00:00');
        const day = d.getDay();
        const diff = (day === 0 ? -6 : 1) - day; // Lunes de esta semana
        const monday = new Date(d);
        monday.setDate(d.getDate() + diff);
        monday.setHours(0, 0, 0, 0);

        const days = [];
        for (let i = 0; i < 7; i++) {
            const next = new Date(monday);
            next.setDate(monday.getDate() + i);
            days.push(next);
        }
        return days;
    },

    /**
     * Formatea un objeto Date a cadena 'YYYY-MM-DD'.
     */
    formatDateISO: function(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    /**
     * Detección de dispositivo móvil y orientación.
     */
    initMobileDetection: function() {
        const updateClasses = () => {
            const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
            const isNarrow = window.innerWidth <= 900;
            const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const isMobile = isMobileUA || (isTouch && isNarrow);
            const isLandscape = window.innerWidth > window.innerHeight;

            document.body.classList.toggle('is-mobile', isMobile);
            document.body.classList.toggle('is-landscape', isLandscape);
            document.body.classList.toggle('is-portrait', !isLandscape);
        };

        window.addEventListener('resize', updateClasses);
        window.addEventListener('orientationchange', updateClasses);
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', updateClasses);
        } else {
            updateClasses();
        }
    }
};

// Iniciar detección automáticamente
if (typeof window !== 'undefined') {
    window.AppUtils.initMobileDetection();
}
