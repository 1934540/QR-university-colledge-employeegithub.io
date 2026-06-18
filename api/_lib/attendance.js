const WORKDAY_START = "09:00";

function parseTimeToMinutes(value) {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function toDateParts(value) {
  const source = value ? new Date(value) : new Date();
  const local = new Date(source.getTime() - source.getTimezoneOffset() * 60000);
  return {
    date: local.toISOString().slice(0, 10),
    time: local.toISOString().slice(11, 16),
    weekday: local.getDay() === 0 ? 7 : local.getDay()
  };
}

function toPlatformDateParts(body = {}) {
  const date = String(body.platformDate || body.platform_date || "").trim();
  const time = String(body.platformTime || body.platform_time || "").trim();
  const weekday = Number(body.platformWeekday || body.platform_weekday);

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    /^\d{2}:\d{2}$/.test(time) &&
    Number.isInteger(weekday) &&
    weekday >= 1 &&
    weekday <= 7
  ) {
    return { date, time, weekday };
  }

  return null;
}

function formatDuration(checkIn, checkOut) {
  let start = parseTimeToMinutes(checkIn);
  let end = parseTimeToMinutes(checkOut);
  if (end < start) end += 24 * 60;
  const minutes = end - start;
  return `${Math.floor(minutes / 60)} ч. ${minutes % 60} мин.`;
}

function calculateStatus(employee, schedules, scanTime, weekday) {
  if (employee.is_vip) {
    return {
      status: "vip",
      details: "VIP сотрудник: проход засчитан без опоздания."
    };
  }

  if (employee.role === "student") {
    const group = employee.student_group || employee.department || "";
    return {
      status: "normal",
      details: `Студент ${group}: вход зафиксирован.`
    };
  }

  const scanMinutes = parseTimeToMinutes(scanTime);
  const activeSchedule = [...(schedules || [])]
    .filter(item => Number(item.day) === Number(weekday))
    .sort((a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time))[0];

  if (activeSchedule) {
    const diff = scanMinutes - parseTimeToMinutes(activeSchedule.start_time);
    if (diff > 10) {
      return {
        status: "critical",
        details: `Критическое опоздание на ${diff} мин. к занятию ${activeSchedule.subject}.`
      };
    }
    if (diff > 0) {
      return {
        status: "late",
        details: `Опоздание на ${diff} мин. к занятию ${activeSchedule.subject}.`
      };
    }
    return {
      status: "normal",
      details: `Прибыл вовремя к занятию ${activeSchedule.subject}.`
    };
  }

  const diff = scanMinutes - parseTimeToMinutes(WORKDAY_START);
  if (diff > 0) {
    return {
      status: "late",
      details: `Опоздание на ${diff} мин. относительно начала дня.`
    };
  }

  return {
    status: "normal",
    details: "Прибыл вовремя к началу рабочего дня."
  };
}

function acceptsGateQr(payload) {
  const text = String(payload || "").trim();
  if (!text) return false;
  if (text === "BOLASHAQ-MAIN-GATE" || text === "BOLASHAQ-MAIN-GATE-01") return true;
  return text.startsWith("BOLASHAQ-MAIN-GATE:");
}

module.exports = {
  acceptsGateQr,
  calculateStatus,
  formatDuration,
  toPlatformDateParts,
  toDateParts
};
