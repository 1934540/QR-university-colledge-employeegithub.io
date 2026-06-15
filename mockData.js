// Предустановленные данные для BolashaqQR
window.DEFAULT_EMPLOYEES = [
  {
    id: "EMP001",
    name: "Аскаров Данияр",
    role: "teacher",
    department: "Кафедра Информационных Технологий",
    isVip: false,
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
    schedules: [
      { day: 1, subject: "Базы данных", startTime: "09:00", endTime: "10:30" }, // Понедельник
      { day: 1, subject: "Алгоритмы и структуры данных", startTime: "11:00", endTime: "12:30" },
      { day: 2, subject: "Веб-разработка", startTime: "13:00", endTime: "14:30" } // Вторник
    ]
  },
  {
    id: "EMP002",
    name: "Смагулова Алия",
    role: "teacher",
    department: "Кафедра Высшей Математики",
    isVip: false,
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
    schedules: [
      { day: 1, subject: "Высшая математика", startTime: "10:00", endTime: "11:30" }, // Понедельник
      { day: 3, subject: "Линейная алгебра", startTime: "09:00", endTime: "10:30" } // Среда
    ]
  },
  {
    id: "EMP003",
    name: "Иванов Сергей",
    role: "teacher",
    department: "Кафедра Общей Физики",
    isVip: false,
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80",
    schedules: [
      { day: 2, subject: "Общая физика", startTime: "09:00", endTime: "10:30" }, // Вторник
      { day: 4, subject: "Квантовая механика", startTime: "11:00", endTime: "12:30" } // Четверг
    ]
  },
  {
    id: "EMP004",
    name: "Нурланова Дина",
    role: "staff",
    department: "Регистратура",
    isVip: false,
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80",
    schedules: [] // У администрации нет пар, учитывается только стандартное начало рабочего дня (09:00)
  },
  {
    id: "EMP005",
    name: "Кожахметов Болат",
    role: "staff",
    department: "Ректорат (Ректор)",
    isVip: true, // "Неприкасаемый" сотрудник
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    schedules: []
  },
  {
    id: "EMP006",
    name: "Маратов Арман",
    role: "teacher",
    department: "Кафедра Химии",
    isVip: false,
    avatar: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80",
    schedules: [
      { day: 1, subject: "Органическая химия", startTime: "09:00", endTime: "10:30" }
    ]
  }
];

// Исторические логи посещаемости сотрудников за предыдущие даты
// Даты в формате ГГГГ-ММ-ДД
window.DEFAULT_LOGS = [
  // Аскаров Данияр - Понедельник 25 мая (пришел вовремя в 08:45, ушел в 16:30)
  {
    id: "LOG_001",
    employeeId: "EMP001",
    employeeName: "Аскаров Данияр",
    role: "teacher",
    date: "2026-05-25",
    checkInTime: "08:45",
    checkOutTime: "16:30",
    workDuration: "7 ч. 45 мин.",
    status: "normal",
    details: "Прибыл вовремя перед началом занятий."
  },
  // Смагулова Алия - Понедельник 25 мая (опоздание во время пары - пришла в 10:15 во время пары 10:00-11:30)
  {
    id: "LOG_002",
    employeeId: "EMP002",
    employeeName: "Смагулова Алия",
    role: "teacher",
    date: "2026-05-25",
    checkInTime: "10:15",
    checkOutTime: "15:00",
    workDuration: "4 ч. 45 мин.",
    status: "critical",
    details: "Критическое опоздание на 15 мин. во время пары 'Высшая математика' (09:00-10:30)."
  },
  // Нурланова Дина - Понедельник 25 мая (опоздание на работу - пришла в 09:12 при начале в 09:00)
  {
    id: "LOG_003",
    employeeId: "EMP004",
    employeeName: "Нурланова Дина",
    role: "staff",
    date: "2026-05-25",
    checkInTime: "09:12",
    checkOutTime: "18:00",
    workDuration: "8 ч. 48 мин.",
    status: "late",
    details: "Опоздание на 12 мин. относительно начала дня (09:00)."
  },
  // Кожахметов Болат (VIP) - Понедельник 25 мая (пришел в 09:40, но так как VIP - статус вовремя)
  {
    id: "LOG_004",
    employeeId: "EMP005",
    employeeName: "Кожахметов Болат",
    role: "staff",
    date: "2026-05-25",
    checkInTime: "09:40",
    checkOutTime: "17:00",
    workDuration: "7 ч. 20 мин.",
    status: "vip",
    details: "Прибытие по VIP-статусу. Опоздания не фиксируются."
  },
  // Опоздания для Маратова Армана (для заполнения папки нарушителей)
  // У него 7 неоправданных обычных опозданий и 1 прямое критическое за прошлые недели
  {
    id: "LOG_M1",
    employeeId: "EMP006",
    employeeName: "Маратов Арман",
    role: "teacher",
    date: "2026-05-11",
    checkInTime: "09:15",
    checkOutTime: "16:00",
    workDuration: "6 ч. 45 мин.",
    status: "late",
    details: "Опоздание на 15 мин. относительно начала дня."
  },
  {
    id: "LOG_M2",
    employeeId: "EMP006",
    employeeName: "Маратов Арман",
    role: "teacher",
    date: "2026-05-12",
    checkInTime: "09:08",
    checkOutTime: "16:00",
    workDuration: "6. ч 52 мин.",
    status: "late",
    details: "Опоздание на 8 мин."
  },
  {
    id: "LOG_M3",
    employeeId: "EMP006",
    employeeName: "Маратов Арман",
    role: "teacher",
    date: "2026-05-13",
    checkInTime: "09:20",
    checkOutTime: "16:00",
    workDuration: "6 ч. 40 мин.",
    status: "late",
    details: "Опоздание на 20 мин."
  },
  {
    id: "LOG_M4",
    employeeId: "EMP006",
    employeeName: "Маратов Арман",
    role: "teacher",
    date: "2026-05-14",
    checkInTime: "09:10",
    checkOutTime: "16:00",
    workDuration: "6 ч. 50 мин.",
    status: "late",
    details: "Опоздание на 10 мин."
  },
  {
    id: "LOG_M5",
    employeeId: "EMP006",
    employeeName: "Маратов Арман",
    role: "teacher",
    date: "2026-05-15",
    checkInTime: "09:30",
    checkOutTime: "16:00",
    workDuration: "6 ч. 30 мин.",
    status: "late",
    details: "Опоздание на 30 мин."
  },
  {
    id: "LOG_M6",
    employeeId: "EMP006",
    employeeName: "Маратов Арман",
    role: "teacher",
    date: "2026-05-18",
    checkInTime: "09:12",
    checkOutTime: "16:00",
    workDuration: "6 ч. 48-мин.",
    status: "late",
    details: "Опоздание на 12 мин."
  },
  {
    id: "LOG_M7",
    employeeId: "EMP006",
    employeeName: "Маратов Арман",
    role: "teacher",
    date: "2026-05-19",
    checkInTime: "09:05",
    checkOutTime: "16:00",
    workDuration: "6 ч. 55 мин.",
    status: "late",
    details: "Опоздание на 5 мин."
  },
  {
    id: "LOG_M8",
    employeeId: "EMP006",
    employeeName: "Маратов Арман",
    role: "teacher",
    date: "2026-05-20",
    checkInTime: "09:15", // Пара химии идет с 09:00 до 10:30 по понедельникам, но в среду нет пары, так что это просто обычное опоздание
    checkOutTime: "16:00",
    workDuration: "6 ч. 45 мин.",
    status: "critical", // Прямое критическое опоздание в понедельник 18 мая
    date: "2026-05-18", // Изменим дату записи LOG_M8 на понедельник, чтобы оно было во время пары
    checkInTime: "09:20", // Во время пары 09:00 - 10:30
    details: "Критическое опоздание на 20 мин. во время пары 'Органическая химия' (09:00-10:30)."
  },
  // Нурланова Дина - Вторник 26 мая (опоздала, но была оправдана администратором)
  {
    id: "LOG_005",
    employeeId: "EMP004",
    employeeName: "Нурланова Дина",
    role: "staff",
    date: "2026-05-26",
    checkInTime: "09:45",
    checkOutTime: "18:00",
    workDuration: "8 ч. 15 мин.",
    status: "excused",
    details: "Опоздание на 45 мин. Оправдано админом. Причина: По состоянию здоровья (Предоставлена справка).",
    excuseReason: "По состоянию здоровья",
    excuseComment: "Предоставлена справка от терапевта."
  }
];
