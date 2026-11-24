
// ============================================================
// LE COCON PET 32 — CLIENT.JS
// PARTIE 1/3
// ============================================================

import { database, ref, set, push, onValue, remove } from "./firebase-config.js";


// ============================================================
// VARIABLES
// ============================================================

let services = [];
let employees = [];
let clients = [];
let salonConfig = {};

let selectedTimeSlotMinutes = null;
let selectedEmployee = null;
let selectedService = null;
let selectedDateISO = null;

let currentCancellationBooking = null;

let servicesLoaded = false;
let employeesLoaded = false;
let clientsLoaded = false;
let configLoaded = false;

let listenersInitialized = false;


// ============================================================
// UTILITAIRES
// ============================================================

function getElement(id) {
    return document.getElementById(id);
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function normalizeString(value) {
    return String(value ?? "").trim().toLowerCase();
}

function getLocalDateISO(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function timeToMinutes(value) {
    if (typeof value === "number") {
        return value;
    }

    if (!value) return null;

    const parts = String(value).split(":");

    if (parts.length < 2) return null;

    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);

    if (isNaN(hours) || isNaN(minutes)) {
        return null;
    }

    return hours * 60 + minutes;
}

function minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return (
        String(hours).padStart(2, "0") +
        ":" +
        String(mins).padStart(2, "0")
    );
}

function formatDateFrench(dateISO) {
    if (!dateISO) return "";

    const parts = dateISO.split("-");

    if (parts.length !== 3) return dateISO;

    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatPrice(price) {
    const number = Number(price);

    if (isNaN(number)) {
        return price ?? "";
    }

    return number.toLocaleString("fr-FR") + " Ar";
}

function isActiveRecord(record) {
    if (!record) return false;

    if (record.active === false) return false;
    if (record.enabled === false) return false;
    if (record.status === "inactive") return false;
    if (record.status === "cancelled") return false;

    return true;
}

function showMessage(element, message) {
    if (!element) return;

    element.innerText = message;
    element.style.display = "block";
}

function hideMessage(element) {
    if (!element) return;

    element.style.display = "none";
}

function showModal(element) {
    if (!element) return;

    element.style.display = "flex";
    element.classList.remove("hidden");
}

function hideModal(element) {
    if (!element) return;

    element.style.display = "none";
    element.classList.add("hidden");
}


// ============================================================
// SERVICES
// ============================================================

function getServiceById(serviceId) {
    return services.find(service =>
        String(service.id) === String(serviceId)
    );
}

function getServiceName(service) {
    return (
        service?.name ||
        service?.serviceName ||
        service?.title ||
        "Service"
    );
}

function getServiceDuration(service) {
    const duration =
        service?.duration ??
        service?.durationMinutes ??
        service?.minutes ??
        service?.duree;

    const value = Number(duration);

    return value > 0 ? value : 30;
}

function getServicePrice(service) {
    return (
        service?.price ??
        service?.prix ??
        service?.amount ??
        0
    );
}


// ============================================================
// EMPLOYÉS
// ============================================================

function getEmployeeName(employee) {
    return (
        employee?.name ||
        employee?.nom ||
        employee?.fullName ||
        employee?.prenom ||
        "Employé"
    );
}

function employeeCanPerformService(employee, service) {
    if (!employee || !service) return false;

    if (
        employee.polyvalent === true ||
        employee.isPolyvalent === true
    ) {
        return true;
    }

    if (!Array.isArray(employee.services)) {
        return false;
    }

    const serviceName = normalizeString(
        getServiceName(service)
    );

    return employee.services.some(item => {

        if (typeof item === "object" && item !== null) {

            return (
                normalizeString(item.name) === serviceName ||
                String(item.id) === String(service.id)
            );
        }

        return (
            normalizeString(item) === serviceName ||
            String(item) === String(service.id)
        );
    });
}

function employeeIsActive(employee) {
    if (!employee) return false;

    if (employee.active === false) return false;
    if (employee.enabled === false) return false;
    if (employee.status === "inactive") return false;

    return true;
}


// ============================================================
// CONFIGURATION DU SALON
// ============================================================

function getDayName(dateISO) {
    const date = new Date(dateISO + "T12:00:00");

    return [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday"
    ][date.getDay()];
}

function getFrenchDayName(dateISO) {
    const date = new Date(dateISO + "T12:00:00");

    return [
        "dimanche",
        "lundi",
        "mardi",
        "mercredi",
        "jeudi",
        "vendredi",
        "samedi"
    ][date.getDay()];
}

function getScheduleForDate(dateISO) {

    const dayName = getDayName(dateISO);
    const frenchDay = getFrenchDayName(dateISO);

    const schedules =
        salonConfig.schedule ||
        salonConfig.schedules ||
        salonConfig.openingHours ||
        salonConfig.hours ||
        salonConfig.horaires ||
        {};

    let daySchedule =
        schedules[dayName] ??
        schedules[frenchDay] ??
        schedules[
            String(new Date(dateISO + "T12:00:00").getDay())
        ];

    if (!daySchedule) {

        daySchedule = {
            open:
                salonConfig.openingTime ||
                salonConfig.open ||
                salonConfig.opening,

            close:
                salonConfig.closingTime ||
                salonConfig.close ||
                salonConfig.closing
        };
    }

    if (!daySchedule) {

        return {
            closed: false,
            open: 9 * 60,
            close: 17 * 60
        };
    }

    if (
        daySchedule === false ||
        daySchedule.closed === true ||
        daySchedule.isClosed === true
    ) {
        return {
            closed: true,
            open: 0,
            close: 0
        };
    }

    if (Array.isArray(daySchedule)) {

        return {
            closed: false,
            open: timeToMinutes(daySchedule[0]),
            close: timeToMinutes(daySchedule[1])
        };
    }

    const open = timeToMinutes(
        daySchedule.open ??
        daySchedule.opening ??
        daySchedule.start ??
        daySchedule.from
    );

    const close = timeToMinutes(
        daySchedule.close ??
        daySchedule.closing ??
        daySchedule.end ??
        daySchedule.to
    );

    if (open === null || close === null) {

        return {
            closed: false,
            open: 9 * 60,
            close: 17 * 60
        };
    }

    return {
        closed: false,
        open,
        close
    };
}


// ============================================================
// HORAIRES DES EMPLOYÉS
// ============================================================

function employeeWorksOnDate(employee, dateISO) {

    const dayName = getDayName(dateISO);
    const frenchDay = getFrenchDayName(dateISO);

    const workingDays =
        employee.workingDays ||
        employee.days ||
        employee.availableDays;

    if (Array.isArray(workingDays)) {

        const dayNumber = new Date(
            dateISO + "T12:00:00"
        ).getDay();

        const allowed = workingDays.some(day => {

            return (
                normalizeString(day) === dayName ||
                normalizeString(day) === frenchDay ||
                Number(day) === dayNumber
            );
        });

        if (!allowed) return false;
    }

    if (
        employee.schedule &&
        typeof employee.schedule === "object"
    ) {

        const employeeDay =
            employee.schedule[dayName] ??
            employee.schedule[frenchDay];

        if (employeeDay === false) return false;

        if (
            employeeDay &&
            (
                employeeDay.closed === true ||
                employeeDay.isClosed === true
            )
        ) {
            return false;
        }
    }

    return true;
}


// ============================================================
// RÉSERVATIONS : HORAIRES ET CONFLITS
// ============================================================

function getBookingStart(booking) {

    if (booking.startMin !== undefined) {
        return Number(booking.startMin);
    }

    if (booking.startTime) {
        return timeToMinutes(booking.startTime);
    }

    if (booking.hour) {
        return timeToMinutes(booking.hour);
    }

    if (booking.time) {
        return timeToMinutes(booking.time);
    }

    return null;
}

function getBookingEnd(booking) {

    if (booking.endMin !== undefined) {
        return Number(booking.endMin);
    }

    const start = getBookingStart(booking);

    if (start === null) return null;

    const duration = Number(
        booking.duration ??
        booking.serviceDuration ??
        30
    );

    return start + duration;
}

function getBookingDate(booking) {
    return (
        booking.dateISO ||
        booking.date ||
        booking.appointmentDate ||
        ""
    );
}

function bookingIsCancelled(booking) {

    return (
        booking.status === "cancelled" ||
        booking.status === "canceled" ||
        booking.status === "annule" ||
        booking.status === "annulé" ||
        booking.cancelled === true ||
        booking.canceled === true
    );
}

function bookingIsActive(booking) {
    return !bookingIsCancelled(booking);
}

function bookingIsForEmployee(booking, employee) {
    return String(booking.employeeId) === String(employee.id);
}

function bookingConflicts(startMin, endMin, booking) {

    const bookingStart = getBookingStart(booking);
    const bookingEnd = getBookingEnd(booking);

    if (bookingStart === null || bookingEnd === null) {
        return false;
    }

    return !(
        endMin <= bookingStart ||
        startMin >= bookingEnd
    );
}


// ============================================================
// EMPLOYÉ DISPONIBLE
// ============================================================

function getAvailableEmployeesAtMinute(
    service,
    dateISO,
    startMin,
    endMin
) {

    const eligibleEmployees = employees.filter(employee =>

        employeeIsActive(employee) &&
        employeeCanPerformService(employee, service) &&
        employeeWorksOnDate(employee, dateISO)

    );

    for (const employee of eligibleEmployees) {

        const busy = clients.some(booking => {

            if (!bookingIsActive(booking)) return false;

            if (getBookingDate(booking) !== dateISO) {
                return false;
            }

            if (!bookingIsForEmployee(booking, employee)) {
                return false;
            }

            return bookingConflicts(
                startMin,
                endMin,
                booking
            );
        });

        if (!busy) {
            return employee;
        }
    }

    return null;
}


// ============================================================
// GÉNÉRATION DES CRÉNEAUX
// ============================================================

function generateDynamicSlots(
    serviceDuration,
    dateISO,
    salonOpen,
    salonClose,
    bookedSlots
) {

    const slots = [];

    const now = new Date();
    const todayStr = getLocalDateISO(now);

    let cursor = salonOpen;

    if (dateISO === todayStr) {

        const currentMinutes =
            now.getHours() * 60 +
            now.getMinutes();

        cursor = Math.max(cursor, currentMinutes);
    }

    cursor = Math.ceil(cursor / 5) * 5;

    while (cursor + serviceDuration <= salonClose) {

        const start = cursor;
        const end = start + serviceDuration;

        const conflict = bookedSlots.some(booking =>
            bookingConflicts(start, end, booking)
        );

        if (!conflict) {
            slots.push({ start, end });
        }

        cursor += 5;
    }

    return slots;
}



// ============================================================
// AFFICHAGE DES SERVICES
// ============================================================

function renderServices() {

    const select = getElement("select-service");

    if (!select) return;

    const previousValue = select.value;

    select.innerHTML = `
        <option value="">-- Sélectionnez un service --</option>
    `;

    services
        .filter(isActiveRecord)
        .forEach(service => {

            const option = document.createElement("option");

            option.value = service.id;

            option.textContent =
                `${getServiceName(service)} — ` +
                `${getServiceDuration(service)} min — ` +
                `${formatPrice(getServicePrice(service))}`;

            select.appendChild(option);
        });

    if (
        previousValue &&
        getServiceById(previousValue)
    ) {
        select.value = previousValue;
    }

    updateServiceSelection();
}


// ============================================================
// AFFICHAGE DES CRÉNEAUX
// ============================================================

function renderAvailableSlots(slots, service, dateISO) {

    const tableBody = getElement(
        "available-slots-table-body"
    );

    const tableWrapper = getElement("table-wrapper");
    const msg = getElement("slots-loading-message");
    const bookingForm = getElement("booking-form-section");

    if (!tableBody || !tableWrapper) return;

    tableBody.innerHTML = "";

    hideMessage(msg);

    tableWrapper.style.display = "block";

    if (bookingForm) {
        bookingForm.classList.add("hidden");
    }

    selectedTimeSlotMinutes = null;
    selectedEmployee = null;

    if (!slots.length) {

        tableBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center;padding:20px;">
                    Aucun créneau disponible pour cette date.
                </td>
            </tr>
        `;

        return;
    }

    slots.forEach(slot => {

        const employee = getAvailableEmployeesAtMinute(
            service,
            dateISO,
            slot.start,
            slot.end
        );

        if (!employee) return;

        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${minutesToTime(slot.start)}</td>

            <td>${minutesToTime(slot.end)}</td>

            <td>${escapeHTML(getEmployeeName(employee))}</td>

            <td>
                <button
                    type="button"
                    class="select-slot-btn"
                >
                    Choisir
                </button>
            </td>
        `;

        const button = row.querySelector(
            ".select-slot-btn"
        );

        button.addEventListener("click", () => {

            selectTimeSlot(slot, employee, button);

        });

        tableBody.appendChild(row);
    });

    if (!tableBody.children.length) {

        tableBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center;padding:20px;">
                    Aucun employé disponible.
                </td>
            </tr>
        `;
    }
}


// ============================================================
// SÉLECTION D'UN CRÉNEAU
// ============================================================

function selectTimeSlot(slot, employee, button) {

    selectedTimeSlotMinutes = slot.start;
    selectedEmployee = employee;

    const bookingForm = getElement(
        "booking-form-section"
    );

    const selectedHour = getElement(
        "client-selected-hour"
    );

    if (selectedHour) {
        selectedHour.value = minutesToTime(slot.start);
    }

    if (bookingForm) {
        bookingForm.classList.remove("hidden");
        bookingForm.style.display = "block";
    }

    document.querySelectorAll(".select-slot-btn")
        .forEach(btn => {
            btn.classList.remove("selected");
        });

    button.classList.add("selected");

    if (bookingForm) {

        bookingForm.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    }
}


// ============================================================
// CHARGEMENT DES DISPONIBILITÉS
// ============================================================

window.loadAvailableTimeSlots = loadAvailableTimeSlots;

function loadAvailableTimeSlots() {

    const tableBody = getElement(
        "available-slots-table-body"
    );

    const tableWrapper = getElement("table-wrapper");
    const msg = getElement("slots-loading-message");
    const select = getElement("select-service");
    const dateInput = getElement("appointment-date");
    const bookingForm = getElement("booking-form-section");

    if (
        !tableBody ||
        !tableWrapper ||
        !msg ||
        !select ||
        !dateInput
    ) {
        return;
    }

    tableBody.innerHTML = "";
    tableWrapper.style.display = "none";

    if (bookingForm) {
        bookingForm.classList.add("hidden");
    }

    selectedTimeSlotMinutes = null;
    selectedEmployee = null;

    const serviceId = select.value;
    const dateISO = dateInput.value;

    if (!serviceId || !dateISO) {

        showMessage(
            msg,
            "Sélectionnez un service et une date valide."
        );

        return;
    }

    if (
        !servicesLoaded ||
        !employeesLoaded ||
        !clientsLoaded ||
        !configLoaded
    ) {

        showMessage(
            msg,
            "Chargement des disponibilités..."
        );

        return;
    }

    const service = getServiceById(serviceId);

    if (!service) {

        showMessage(
            msg,
            "Ce service n'existe plus."
        );

        return;
    }

    selectedService = service;
    selectedDateISO = dateISO;

    const selectedDate = new Date(
        dateISO + "T12:00:00"
    );

    const today = new Date();

    today.setHours(0, 0, 0, 0);

    if (isNaN(selectedDate.getTime())) {

        showMessage(msg, "Date invalide.");

        return;
    }

    if (selectedDate < today) {

        showMessage(
            msg,
            "Veuillez choisir une date future."
        );

        return;
    }

    const schedule = getScheduleForDate(dateISO);

    if (schedule.closed) {

        showMessage(
            msg,
            "Le salon est fermé ce jour-là."
        );

        return;
    }

    if (
        schedule.open === null ||
        schedule.close === null ||
        schedule.open >= schedule.close
    ) {

        showMessage(
            msg,
            "Les horaires du salon ne sont pas correctement configurés."
        );

        return;
    }

    const duration = getServiceDuration(service);

    const eligibleEmployees = employees.filter(employee =>

        employeeIsActive(employee) &&
        employeeCanPerformService(employee, service) &&
        employeeWorksOnDate(employee, dateISO)

    );

    if (!eligibleEmployees.length) {

        showMessage(
            msg,
            "Aucun employé ne réalise ce service à cette date."
        );

        return;
    }

    const bookedSlots = clients.filter(booking =>

        bookingIsActive(booking) &&
        getBookingDate(booking) === dateISO

    );

    const slots = generateDynamicSlots(
        duration,
        dateISO,
        schedule.open,
        schedule.close,
        []
    );

    const validSlots = slots.filter(slot => {

        return getAvailableEmployeesAtMinute(
            service,
            dateISO,
            slot.start,
            slot.end
        ) !== null;

    });

    renderAvailableSlots(
        validSlots,
        service,
        dateISO
    );

    const hint = getElement("salon-days-hint");

    if (hint) {

        hint.innerText =
            `Horaires : ${minutesToTime(schedule.open)} ` +
            `à ${minutesToTime(schedule.close)}.`;
    }
}


// ============================================================
// CHANGEMENT DE SERVICE
// ============================================================

window.updateServiceSelection = updateServiceSelection;

function updateServiceSelection() {

    const select = getElement("select-service");

    if (!select) return;

    selectedService = getServiceById(select.value);

    loadAvailableTimeSlots();
}


// ============================================================
// CONFIRMATION DE LA RÉSERVATION
// ============================================================

window.confirmClientBooking = confirmClientBooking;

async function confirmClientBooking() {

    const nameInput = getElement("client-name");
    const phoneInput = getElement("client-phone");
    const dateInput = getElement("appointment-date");
    const serviceSelect = getElement("select-service");

    const button = getElement(
        "btn-validate-booking"
    );

    if (
        !nameInput ||
        !phoneInput ||
        !dateInput ||
        !serviceSelect
    ) {

        alert("Erreur : formulaire client introuvable.");

        return;
    }

    const clientName = nameInput.value.trim();
    const clientPhone = phoneInput.value.trim();

    const dateISO = dateInput.value;

    const service = getServiceById(
        serviceSelect.value
    );

    if (!clientName || !clientPhone) {

        alert(
            "Veuillez remplir votre nom et votre téléphone."
        );

        return;
    }

    if (!service) {

        alert("Veuillez sélectionner un service.");

        return;
    }

    if (
        selectedTimeSlotMinutes === null ||
        !selectedEmployee
    ) {

        alert(
            "Veuillez sélectionner un créneau horaire."
        );

        return;
    }

    const startMin = selectedTimeSlotMinutes;

    const endMin =
        startMin + getServiceDuration(service);

    // Vérification de la disponibilité
    const employee = getAvailableEmployeesAtMinute(
        service,
        dateISO,
        startMin,
        endMin
    );

    if (!employee) {

        alert(
            "Ce créneau vient d'être réservé. " +
            "Veuillez en choisir un autre."
        );

        loadAvailableTimeSlots();

        return;
    }

    const schedule = getScheduleForDate(dateISO);

    if (
        startMin < schedule.open ||
        endMin > schedule.close
    ) {

        alert(
            "Ce créneau dépasse les horaires du salon."
        );

        return;
    }

    const booking = {

        clientName,

        clientPhone,

        serviceId: service.id,

        serviceName: getServiceName(service),

        serviceDuration: getServiceDuration(service),

        servicePrice: getServicePrice(service),

        employeeId: employee.id,

        employeeName: getEmployeeName(employee),

        dateISO,

        startMin,

        endMin,

        startTime: minutesToTime(startMin),

        endTime: minutesToTime(endMin),

        status: "confirmed",

        createdAt: Date.now()

    };

    if (button) {

        button.disabled = true;

        button.textContent = "Enregistrement...";
    }

    try {

        await push(
            ref(database, "clients"),
            booking
        );

        showBookingSuccess(booking);

        nameInput.value = "";
        phoneInput.value = "";

        selectedTimeSlotMinutes = null;
        selectedEmployee = null;

        const selectedHour = getElement(
            "client-selected-hour"
        );

        if (selectedHour) {
            selectedHour.value = "";
        }

        const bookingForm = getElement(
            "booking-form-section"
        );

        if (bookingForm) {
            bookingForm.classList.add("hidden");
        }

        loadAvailableTimeSlots();

    } catch (error) {

        console.error(
            "Erreur réservation :",
            error
        );

        alert(
            "Impossible d'enregistrer votre réservation. " +
            "Veuillez réessayer."
        );

    } finally {

        if (button) {

            button.disabled = false;

            button.textContent =
                "Confirmer la réservation";
        }
    }
}


// ============================================================
// TICKET DE CONFIRMATION
// ============================================================

function showBookingSuccess(booking) {

    const modal = getElement("success-modal");
    const ticket = getElement("ticket-content");

    if (!modal || !ticket) {

        alert(
            "Réservation enregistrée avec succès !"
        );

        return;
    }

    ticket.innerHTML = `

        <div class="client-ticket">

            <h2>LE COCON PET 32</h2>

            <p>
                <strong>Confirmation de réservation</strong>
            </p>

            <hr>

            <p>
                <strong>Client :</strong>
                ${escapeHTML(booking.clientName)}
            </p>

            <p>
                <strong>Téléphone :</strong>
                ${escapeHTML(booking.clientPhone)}
            </p>

            <p>
                <strong>Service :</strong>
                ${escapeHTML(booking.serviceName)}
            </p>

            <p>
                <strong>Employé :</strong>
                ${escapeHTML(booking.employeeName)}
            </p>

            <p>
                <strong>Date :</strong>
                ${formatDateFrench(booking.dateISO)}
            </p>

            <p>
                <strong>Heure :</strong>
                ${escapeHTML(booking.startTime)}
            </p>

            <p>
                <strong>Durée :</strong>
                ${booking.serviceDuration} minutes
            </p>

            <p>
                <strong>Prix :</strong>
                ${formatPrice(booking.servicePrice)}
            </p>

            <hr>

            <p>Merci de votre confiance !</p>

        </div>

    `;

    showModal(modal);
}


// ============================================================
// FERMER LE TICKET
// ============================================================

window.closeSuccessModal = closeSuccessModal;

function closeSuccessModal() {

    hideModal(
        getElement("success-modal")
    );
}

// ============================================================
// RECHERCHE DES RÉSERVATIONS
// ============================================================

window.searchMyBookings = searchMyBookings;

function searchMyBookings() {

    const phoneInput = getElement("search-phone");
    const resultContainer = getElement("my-bookings-list");

    if (!phoneInput || !resultContainer) return;

    const phone = phoneInput.value.trim();

    if (!phone) {

        resultContainer.innerHTML = `
            <p>Veuillez saisir votre numéro de téléphone.</p>
        `;

        return;
    }

    const normalizedPhone = normalizePhone(phone);

    const foundBookings = clients.filter(booking => {

        return (
            normalizePhone(booking.clientPhone) ===
            normalizedPhone
        );

    });

    renderMyBookings(
        foundBookings,
        resultContainer
    );
}


// ============================================================
// NORMALISATION DU NUMÉRO
// ============================================================

function normalizePhone(phone) {

    return String(phone ?? "")
        .replace(/\s+/g, "")
        .replace(/[().-]/g, "");

}


// ============================================================
// AFFICHAGE DES RÉSERVATIONS CLIENT
// ============================================================

function renderMyBookings(bookings, container) {

    if (!bookings.length) {

        container.innerHTML = `
            <p>
                Aucune réservation trouvée avec ce numéro.
            </p>
        `;

        return;
    }

    const sortedBookings = [...bookings].sort((a, b) => {

        return (
            String(b.dateISO).localeCompare(String(a.dateISO)) ||
            Number(b.startMin || 0) -
            Number(a.startMin || 0)
        );

    });

    container.innerHTML = sortedBookings.map(booking => {

        const cancelled = bookingIsCancelled(booking);

        return `

            <div class="my-booking-card">

                <h3>
                    ${escapeHTML(booking.serviceName || "Service")}
                </h3>

                <p>
                    <strong>Date :</strong>
                    ${formatDateFrench(getBookingDate(booking))}
                </p>

                <p>
                    <strong>Heure :</strong>
                    ${escapeHTML(
                        booking.startTime ||
                        minutesToTime(getBookingStart(booking) || 0)
                    )}
                </p>

                <p>
                    <strong>Employé :</strong>
                    ${escapeHTML(booking.employeeName || "—")}
                </p>

                <p>
                    <strong>Prix :</strong>
                    ${formatPrice(booking.servicePrice)}
                </p>

                <p>
                    <strong>État :</strong>
                    ${cancelled ? "Annulée" : "Confirmée"}
                </p>

                ${
                    !cancelled
                    ?
                    `
                        <button
                            type="button"
                            class="cancel-booking-btn"
                            data-booking-id="${escapeHTML(booking.id)}"
                        >
                            Demander l'annulation
                        </button>
                    `
                    :
                    ""
                }

            </div>

        `;

    }).join("");

    // Ajouter les événements aux boutons d'annulation
    container.querySelectorAll(".cancel-booking-btn")
        .forEach(button => {

            button.addEventListener("click", () => {

                const bookingId =
                    button.dataset.bookingId;

                triggerCancelProcess(bookingId);

            });

        });
}


// ============================================================
// DÉCLENCHER UNE ANNULATION
// ============================================================

window.triggerCancelProcess = triggerCancelProcess;

function triggerCancelProcess(bookingId) {

    const booking = clients.find(item =>
        String(item.id) === String(bookingId)
    );

    if (!booking) {

        alert("Réservation introuvable.");

        return;
    }

    if (bookingIsCancelled(booking)) {

        alert("Cette réservation est déjà annulée.");

        return;
    }

    currentCancellationBooking = booking;

    const modal = getElement(
        "cancel-reason-modal"
    );

    const reasonInput = getElement(
        "cancel-reason"
    );

    if (reasonInput) {
        reasonInput.value = "";
    }

    showModal(modal);
}


// ============================================================
// CONFIRMATION ANNULATION
// ============================================================

window.confirmCancellation = confirmCancellation;

function confirmCancellation() {

    submitCancellationReason();

}


// ============================================================
// ENREGISTRER LE MOTIF D'ANNULATION
// ============================================================

window.submitCancellationReason =
    submitCancellationReason;

async function submitCancellationReason() {

    if (!currentCancellationBooking) {

        alert("Aucune réservation sélectionnée.");

        return;
    }

    const reasonInput = getElement("cancel-reason");

    const reason = reasonInput
        ? reasonInput.value.trim()
        : "";

    if (!reason) {

        alert(
            "Veuillez indiquer le motif de votre demande."
        );

        return;
    }

    const booking = currentCancellationBooking;

    try {

        // Enregistrer la demande d'annulation
        await push(
            ref(database, "cancellations"),
            {

                bookingId: booking.id,

                clientName: booking.clientName,

                clientPhone: booking.clientPhone,

                serviceName: booking.serviceName,

                dateISO: booking.dateISO,

                startTime: booking.startTime,

                employeeId: booking.employeeId,

                employeeName: booking.employeeName,

                reason,

                status: "pending",

                createdAt: Date.now()

            }
        );

        // Supprimer la réservation de la liste clients
        await remove(
            ref(database, "clients/" + booking.id)
        );

        hideModal(
            getElement("cancel-reason-modal")
        );

        currentCancellationBooking = null;

        alert(
            "Votre demande d'annulation a été enregistrée."
        );

        searchMyBookings();

        loadAvailableTimeSlots();

    } catch (error) {

        console.error(
            "Erreur annulation :",
            error
        );

        alert(
            "Erreur lors de l'enregistrement de l'annulation."
        );
    }
}


// ============================================================
// ANNULATION DIRECTE
// ============================================================

window.cancelBookingById = cancelBookingById;

async function cancelBookingById(bookingId) {

    const booking = clients.find(item =>
        String(item.id) === String(bookingId)
    );

    if (!booking) return;

    const confirmation = confirm(
        "Voulez-vous vraiment annuler cette réservation ?"
    );

    if (!confirmation) return;

    try {

        await remove(
            ref(database, "clients/" + booking.id)
        );

        alert("Réservation annulée.");

        searchMyBookings();

        loadAvailableTimeSlots();

    } catch (error) {

        console.error(error);

        alert(
            "Impossible d'annuler cette réservation."
        );
    }
}


// ============================================================
// INITIALISATION DES ÉCOUTEURS FIREBASE
// ============================================================

function initializeFirebaseListeners() {

    if (listenersInitialized) return;

    listenersInitialized = true;


    // SERVICES
    onValue(
        ref(database, "services"),

        snapshot => {

            services = [];

            snapshot.forEach(child => {

                services.push({
                    id: child.key,
                    ...child.val()
                });

            });

            servicesLoaded = true;

            renderServices();

            loadAvailableTimeSlots();

        },

        error => {

            console.error(
                "Erreur services :",
                error
            );

            showMessage(
                getElement("slots-loading-message"),
                "Impossible de charger les services."
            );

        }
    );


    // EMPLOYÉS
    onValue(
        ref(database, "employees"),

        snapshot => {

            employees = [];

            snapshot.forEach(child => {

                employees.push({
                    id: child.key,
                    ...child.val()
                });

            });

            employeesLoaded = true;

            loadAvailableTimeSlots();

        },

        error => {

            console.error(
                "Erreur employés :",
                error
            );

        }
    );


    // RÉSERVATIONS
    onValue(
        ref(database, "clients"),

        snapshot => {

            clients = [];

            snapshot.forEach(child => {

                clients.push({
                    id: child.key,
                    ...child.val()
                });

            });

            clientsLoaded = true;

            loadAvailableTimeSlots();

        },

        error => {

            console.error(
                "Erreur réservations :",
                error
            );

        }
    );


    // CONFIGURATION SALON
    onValue(
        ref(database, "salon_config"),

        snapshot => {

            salonConfig = snapshot.val() || {};

            configLoaded = true;

            loadAvailableTimeSlots();

        },

        error => {

            console.error(
                "Erreur configuration :",
                error
            );

        }
    );

}


// ============================================================
// INITIALISATION DE LA PAGE CLIENT
// ============================================================

function initClientPage() {

    const dateInput = getElement("appointment-date");

    if (dateInput) {

        // Empêcher de sélectionner une date passée
        dateInput.min = getLocalDateISO();

        // Si aucune date n'est choisie,
        // sélectionner aujourd'hui
        if (!dateInput.value) {
            dateInput.value = getLocalDateISO();
        }

        dateInput.addEventListener(
            "change",
            loadAvailableTimeSlots
        );
    }

    const serviceSelect = getElement(
        "select-service"
    );

    if (serviceSelect) {

        serviceSelect.addEventListener(
            "change",
            updateServiceSelection
        );
    }

    const searchButton = getElement(
        "search-bookings-btn"
    );

    if (searchButton) {

        searchButton.addEventListener(
            "click",
            searchMyBookings
        );
    }

    const searchPhone = getElement(
        "search-phone"
    );

    if (searchPhone) {

        searchPhone.addEventListener(
            "keydown",
            event => {

                if (event.key === "Enter") {

                    event.preventDefault();

                    searchMyBookings();
                }
            }
        );
    }

    const bookingButton = getElement(
        "btn-validate-booking"
    );

    if (bookingButton) {

        bookingButton.addEventListener(
            "click",
            confirmClientBooking
        );
    }

    initializeFirebaseListeners();
}


// ============================================================
// LANCEMENT
// ============================================================

if (document.readyState === "loading") {

    document.addEventListener(
        "DOMContentLoaded",
        initClientPage
    );

} else {

    initClientPage();

}


// ============================================================
// FIN CLIENT.JS
// ============================================================
