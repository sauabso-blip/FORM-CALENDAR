/**
 * Utils - attached to window.AppUtils to function without ES Modules
 */
(function () {
    window.AppUtils = {};

    window.AppUtils.generateId = function () {
        return Math.random().toString(36).substr(2, 9);
    };

    window.AppUtils.formatDateISO = function (date) {
        if (!date) return '';
        const d = new Date(date);
        const month = '' + (d.getMonth() + 1);
        const day = '' + d.getDate();
        const year = d.getFullYear();
        return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
    };

    window.AppUtils.formatDateDisplay = function (isoDateString) {
        if (!isoDateString) return '';
        const [year, month, day] = isoDateString.split('-');
        return `${day}/${month}/${year}`;
    };

    window.AppUtils.getDaysInMonth = function (year, month) {
        return new Date(year, month + 1, 0).getDate();
    };

    window.AppUtils.getFirstDayOfMonth = function (year, month) {
        return new Date(year, month, 1).getDay();
    };

    window.AppUtils.addDays = function (isoDateString, days) {
        const d = new Date(isoDateString);
        d.setDate(d.getDate() + days);
        return window.AppUtils.formatDateISO(d);
    };

    window.AppUtils.isDateBetween = function (targetISO, startISO, endISO) {
        return targetISO >= startISO && targetISO <= endISO;
    };

    window.AppUtils.diffInDays = function (startISO, endISO) {
        const d1 = new Date(startISO);
        const d2 = new Date(endISO);
        const diffTime = Math.abs(d2 - d1);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays + 1;
    };
})();
