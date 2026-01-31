window.AppUtils = {
    getDaysInMonth: function(year, month) {
        return new Date(year, month + 1, 0).getDate();
    },

    formatDateDisplay: function(dateStr) {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    }
};