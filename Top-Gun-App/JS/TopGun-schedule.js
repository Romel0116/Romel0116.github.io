import { auth, db } from "./TopGun-firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    Timestamp,
    updateDoc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const scheduleTeamName = document.getElementById("scheduleTeamName");
const scheduleStatus = document.getElementById("scheduleStatus");
const scheduleComposer = document.getElementById("scheduleComposer");
const scheduleEventType = document.getElementById("scheduleEventType");
const scheduleEventTitle = document.getElementById("scheduleEventTitle");
const scheduleEventDate = document.getElementById("scheduleEventDate");
const scheduleEventTime = document.getElementById("scheduleEventTime");
const scheduleEventLocation = document.getElementById("scheduleEventLocation");
const scheduleEventNotes = document.getElementById("scheduleEventNotes");
const createScheduleEventBtn = document.getElementById("createScheduleEventBtn");
const upcomingScheduleList = document.getElementById("upcomingScheduleList");
const pastScheduleList = document.getElementById("pastScheduleList");
const backToTeamFromSchedule = document.getElementById("backToTeamFromSchedule");
const scheduleLogoutBtn = document.getElementById("scheduleLogoutBtn");
const schedulePageMessage = document.getElementById("schedulePageMessage");

const urlParameters = new URLSearchParams(window.location.search);
const teamId = urlParameters.get("teamId");

let currentUser = null;
let currentUserName = "";
let currentTeam = null;
let unsubscribeFromSchedule = null;
const attendanceListeners = new Map();
let currentEditingEventId = null;

const cancelScheduleEditBtn = document.createElement("button");
cancelScheduleEditBtn.type = "button";
cancelScheduleEditBtn.id = "cancelScheduleEditBtn";
cancelScheduleEditBtn.className = "schedule-cancel-edit-button";
cancelScheduleEditBtn.textContent = "Cancel Edit";
cancelScheduleEditBtn.hidden = true;
createScheduleEventBtn.insertAdjacentElement("afterend", cancelScheduleEditBtn);

function showScheduleMessage(text, type = "error") {
    schedulePageMessage.textContent = text;
    schedulePageMessage.classList.toggle("success", type === "success");
}

async function markScheduleSeen() {
    if (!currentUser || !teamId) {
        return;
    }

    try {
        await setDoc(
            doc(db, "teams", teamId, "memberReadStatus", currentUser.uid),
            {
                userId: currentUser.uid,
                scheduleSeenAt: serverTimestamp()
            },
            { merge: true }
        );
    } catch (error) {
        console.error("Unable to mark Schedule as viewed:", error);
    }
}

async function createTeamNotification(feature, title, sourceId = "") {
    await addDoc(
        collection(db, "teams", teamId, "notifications"),
        {
            feature,
            title: title.slice(0, 150),
            sourceId,
            actorId: currentUser.uid,
            createdAt: serverTimestamp()
        }
    );
}

function disableSchedulePage(message) {
    scheduleTeamName.textContent = "Schedule unavailable";
    scheduleStatus.textContent = "";
    scheduleComposer.hidden = true;
    upcomingScheduleList.innerHTML = "";
    pastScheduleList.innerHTML = "";

    const emptyMessage = document.createElement("p");
    emptyMessage.className = "schedule-empty-message";
    emptyMessage.textContent = message;
    upcomingScheduleList.appendChild(emptyMessage);
}

function formatEventDate(date) {
    return date.toLocaleDateString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function formatEventTime(date) {
    return date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
    });
}

function eventIcon(type) {
    const icons = {
        game: "⚽",
        practice: "🏃",
        meeting: "🗣️",
        tournament: "🏆"
    };

    return icons[type] || "📅";
}

function dateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function timeInputValue(date) {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
}

function resetScheduleForm() {
    currentEditingEventId = null;
    scheduleEventType.value = "game";
    scheduleEventTitle.value = "";
    scheduleEventDate.value = "";
    scheduleEventTime.value = "";
    scheduleEventLocation.value = "";
    scheduleEventNotes.value = "";
    createScheduleEventBtn.textContent = "Add Event";
    cancelScheduleEditBtn.hidden = true;
}

function beginScheduleEdit(eventId, eventData) {
    const startsAt = eventData.startsAt?.toDate
        ? eventData.startsAt.toDate()
        : new Date(eventData.startsAt);

    currentEditingEventId = eventId;
    scheduleEventType.value = eventData.type || "game";
    scheduleEventTitle.value = eventData.title || "";
    scheduleEventDate.value = dateInputValue(startsAt);
    scheduleEventTime.value = timeInputValue(startsAt);
    scheduleEventLocation.value = eventData.location || "";
    scheduleEventNotes.value = eventData.notes || "";
    createScheduleEventBtn.textContent = "Save Changes";
    cancelScheduleEditBtn.hidden = false;
    scheduleComposer.scrollIntoView({ behavior: "smooth", block: "start" });
    scheduleEventTitle.focus({ preventScroll: true });
    showScheduleMessage("Update the event fields, then select Save Changes.", "success");
}

async function postEventReminder(eventId, eventData) {
    if (!currentUser || currentTeam?.createdBy !== currentUser.uid) {
        showScheduleMessage("Only the team owner can post event reminders.");
        return;
    }

    const startsAt = eventData.startsAt?.toDate
        ? eventData.startsAt.toDate()
        : new Date(eventData.startsAt);

    const confirmed = window.confirm(
        `Post an announcement reminder for “${eventData.title || "this event"}”?`
    );

    if (!confirmed) {
        return;
    }

    const reminderLines = [
        `${eventIcon(eventData.type)} ${eventData.title || "Team Event"}`,
        `Date: ${formatEventDate(startsAt)}`,
        `Time: ${formatEventTime(startsAt)}`
    ];

    if (eventData.location) {
        reminderLines.push(`Location: ${eventData.location}`);
    }

    if (eventData.notes) {
        reminderLines.push(`Notes: ${eventData.notes}`);
    }

    reminderLines.push("Open the team Schedule to update your attendance response.");

    const reminderTitle =
        `Event Reminder: ${eventData.title || "Team Event"}`.slice(0, 100);

    try {
        const batch = writeBatch(db);
        const announcementReference = doc(
            collection(db, "teams", teamId, "announcements")
        );
        const notificationReference = doc(
            collection(db, "teams", teamId, "notifications")
        );

        batch.set(announcementReference, {
            title: reminderTitle,
            message: reminderLines.join("\n"),
            authorId: currentUser.uid,
            authorName: currentUserName,
            authorEmail: currentUser.email || "",
            scheduleEventId: eventId,
            createdAt: serverTimestamp()
        });

        batch.set(notificationReference, {
            feature: "announcements",
            title: reminderTitle,
            sourceId: announcementReference.id,
            actorId: currentUser.uid,
            createdAt: serverTimestamp()
        });

        await batch.commit();

        showScheduleMessage(
            "Event reminder posted to Team Announcements.",
            "success"
        );
    } catch (error) {
        console.error("Unable to post event reminder:", error);
        showScheduleMessage(`${error.code || "Unknown error"}: ${error.message}`);
    }
}

async function deleteScheduleEvent(eventId, eventTitle) {
    if (!currentUser || currentTeam?.createdBy !== currentUser.uid) {
        showScheduleMessage("Only the team owner can delete events.");
        return;
    }

    const confirmed = window.confirm(
        `Delete “${eventTitle || "this event"}”? Its attendance responses will also be deleted.`
    );

    if (!confirmed) {
        return;
    }

    try {
        const eventReference = doc(db, "teams", teamId, "scheduleEvents", eventId);
        const attendanceSnapshot = await getDocs(
            collection(eventReference, "attendance")
        );
        const batch = writeBatch(db);

        attendanceSnapshot.forEach((attendanceDocument) => {
            batch.delete(attendanceDocument.ref);
        });

        batch.delete(eventReference);

        const notificationReference = doc(
            collection(db, "teams", teamId, "notifications")
        );

        batch.set(notificationReference, {
            feature: "schedule",
            title: `Event deleted: ${eventTitle || "Team Event"}`.slice(0, 150),
            sourceId: eventId,
            actorId: currentUser.uid,
            createdAt: serverTimestamp()
        });

        await batch.commit();

        if (currentEditingEventId === eventId) {
            resetScheduleForm();
        }

        showScheduleMessage("Event and attendance responses deleted.", "success");
    } catch (error) {
        console.error("Unable to delete event:", error);
        showScheduleMessage(`${error.code || "Unknown error"}: ${error.message}`);
    }
}

function stopAttendanceListeners() {
    attendanceListeners.forEach((unsubscribe) => unsubscribe());
    attendanceListeners.clear();
}

async function saveAttendance(eventId, status, buttons) {
    if (!currentUser || !currentTeam || !teamId) {
        showScheduleMessage("The schedule page is not ready.");
        return;
    }

    const members = Array.isArray(currentTeam.members)
        ? currentTeam.members
        : [];

    if (!members.includes(currentUser.uid)) {
        showScheduleMessage("Only team members can respond to events.");
        return;
    }

    buttons.forEach((button) => {
        button.disabled = true;
    });

    try {
        await setDoc(
            doc(
                db,
                "teams",
                teamId,
                "scheduleEvents",
                eventId,
                "attendance",
                currentUser.uid
            ),
            {
                userId: currentUser.uid,
                userName: currentUserName,
                status,
                updatedAt: serverTimestamp()
            }
        );

        showScheduleMessage("Your attendance response was saved.", "success");
    } catch (error) {
        console.error("Unable to save attendance:", error);
        showScheduleMessage(`${error.code || "Unknown error"}: ${error.message}`);
    } finally {
        buttons.forEach((button) => {
            button.disabled = false;
        });
    }
}

function createAttendanceSection(eventId, canRespond) {
    const section = document.createElement("div");
    section.className = "schedule-attendance";

    const heading = document.createElement("p");
    heading.className = "schedule-attendance-heading";
    heading.textContent = canRespond ? "Will you attend?" : "Attendance";

    const buttonRow = document.createElement("div");
    buttonRow.className = "schedule-attendance-buttons";

    const choices = [
        { status: "going", label: "Going", icon: "✅" },
        { status: "maybe", label: "Maybe", icon: "❓" },
        { status: "cantAttend", label: "Can't Attend", icon: "❌" }
    ];

    const buttons = choices.map((choice) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "attendance-button";
        button.dataset.status = choice.status;
        button.textContent = `${choice.icon} ${choice.label} (0)`;

        if (canRespond) {
            button.addEventListener("click", () => {
                saveAttendance(eventId, choice.status, buttons);
            });
        } else {
            button.disabled = true;
        }

        buttonRow.appendChild(button);
        return button;
    });

    const responseDetails = document.createElement("details");
    responseDetails.className = "attendance-response-details";

    const responseSummary = document.createElement("summary");
    responseSummary.textContent = "View responses (0)";

    const responseGroups = document.createElement("div");
    responseGroups.className = "attendance-response-groups";

    const responseLists = new Map();

    choices.forEach((choice) => {
        const group = document.createElement("section");
        group.className = "attendance-response-group";

        const groupHeading = document.createElement("h4");
        groupHeading.textContent = `${choice.icon} ${choice.label}`;

        const nameList = document.createElement("ul");
        const emptyItem = document.createElement("li");
        emptyItem.className = "attendance-no-responses";
        emptyItem.textContent = "No responses";
        nameList.appendChild(emptyItem);

        group.append(groupHeading, nameList);
        responseGroups.appendChild(group);
        responseLists.set(choice.status, nameList);
    });

    responseDetails.append(responseSummary, responseGroups);
    section.append(heading, buttonRow, responseDetails);

    const attendanceReference = collection(
        db,
        "teams",
        teamId,
        "scheduleEvents",
        eventId,
        "attendance"
    );

    const unsubscribe = onSnapshot(
        attendanceReference,
        (snapshot) => {
            const totals = {
                going: 0,
                maybe: 0,
                cantAttend: 0
            };

            const names = {
                going: [],
                maybe: [],
                cantAttend: []
            };

            let currentStatus = "";

            snapshot.forEach((responseDocument) => {
                const response = responseDocument.data();

                if (Object.hasOwn(totals, response.status)) {
                    totals[response.status] += 1;
                    names[response.status].push(
                        response.userName || "Team member"
                    );
                }

                if (responseDocument.id === currentUser?.uid) {
                    currentStatus = response.status;
                }
            });

            buttons.forEach((button, index) => {
                const choice = choices[index];
                button.textContent =
                    `${choice.icon} ${choice.label} (${totals[choice.status]})`;
                button.classList.toggle(
                    "selected",
                    choice.status === currentStatus
                );
                button.setAttribute(
                    "aria-pressed",
                    choice.status === currentStatus ? "true" : "false"
                );
            });

            responseSummary.textContent = `View responses (${snapshot.size})`;

            choices.forEach((choice) => {
                const nameList = responseLists.get(choice.status);
                nameList.innerHTML = "";

                const sortedNames = names[choice.status].sort((first, second) =>
                    first.localeCompare(second)
                );

                if (sortedNames.length === 0) {
                    const emptyItem = document.createElement("li");
                    emptyItem.className = "attendance-no-responses";
                    emptyItem.textContent = "No responses";
                    nameList.appendChild(emptyItem);
                    return;
                }

                sortedNames.forEach((name) => {
                    const nameItem = document.createElement("li");
                    nameItem.textContent = name;
                    nameList.appendChild(nameItem);
                });
            });
        },
        (error) => {
            console.error("Unable to load attendance:", error);
            heading.textContent = "Attendance unavailable";
        }
    );

    attendanceListeners.set(eventId, unsubscribe);
    return section;
}

function createScheduleCard(eventId, eventData, canRespond) {
    const startsAt = eventData.startsAt?.toDate
        ? eventData.startsAt.toDate()
        : new Date(eventData.startsAt);

    const card = document.createElement("article");
    card.className = "schedule-event-card";

    const icon = document.createElement("div");
    icon.className = "schedule-event-icon";
    icon.textContent = eventIcon(eventData.type);

    const content = document.createElement("div");
    content.className = "schedule-event-content";

    const topRow = document.createElement("div");
    topRow.className = "schedule-event-top-row";

    const heading = document.createElement("div");
    heading.className = "schedule-event-heading";
    const badge = document.createElement("span");
    badge.className = `schedule-type-badge schedule-type-${eventData.type || "event"}`;
    badge.textContent = eventData.type || "event";

    const title = document.createElement("h3");
    title.textContent = eventData.title || "Team Event";
    heading.append(badge, title);

    if (eventData.source === "teamsideline") {
        const leagueManagedBadge = document.createElement("span");
        leagueManagedBadge.className = "league-managed-badge";
        leagueManagedBadge.textContent = "League Managed";
        heading.appendChild(leagueManagedBadge);
    }

    if (currentTeam?.createdBy === currentUser?.uid) {
        const ownerActions = document.createElement("div");
        ownerActions.className = "schedule-owner-actions";

        if (canRespond) {
            const reminderButton = document.createElement("button");
            reminderButton.type = "button";
            reminderButton.className = "schedule-reminder-button";
            reminderButton.textContent = "Post Reminder";
            reminderButton.addEventListener("click", async () => {
                reminderButton.disabled = true;
                reminderButton.textContent = "Posting...";

                await postEventReminder(eventId, eventData);

                reminderButton.disabled = false;
                reminderButton.textContent = "Post Reminder";
            });

            ownerActions.appendChild(reminderButton);
        }

        if (eventData.source !== "teamsideline") {
            const editButton = document.createElement("button");
            editButton.type = "button";
            editButton.className = "schedule-edit-button";
            editButton.textContent = "Edit";
            editButton.addEventListener("click", () => {
                beginScheduleEdit(eventId, eventData);
            });

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "schedule-delete-button";
            deleteButton.textContent = "Delete";
            deleteButton.addEventListener("click", () => {
                deleteScheduleEvent(eventId, eventData.title);
            });

            ownerActions.append(editButton, deleteButton);
        }

        heading.appendChild(ownerActions);
    }

    const dateBlock = document.createElement("div");
    dateBlock.className = "schedule-event-date";
    const dateText = document.createElement("strong");
    dateText.textContent = formatEventDate(startsAt);
    const timeText = document.createElement("span");
    timeText.textContent = formatEventTime(startsAt);
    dateBlock.append(dateText, timeText);

    topRow.append(heading, dateBlock);
    content.appendChild(topRow);

    if (eventData.location) {
        const location = document.createElement("p");
        location.className = "schedule-event-location";
        location.textContent = `📍 ${eventData.location}`;
        content.appendChild(location);
    }

    if (eventData.notes) {
        const notes = document.createElement("p");
        notes.className = "schedule-event-notes";
        notes.textContent = eventData.notes;
        content.appendChild(notes);
    }

    content.appendChild(createAttendanceSection(eventId, canRespond));

    card.append(icon, content);
    return card;
}

function renderSchedule(snapshot) {
    markScheduleSeen();
    stopAttendanceListeners();
    upcomingScheduleList.innerHTML = "";
    pastScheduleList.innerHTML = "";

    const now = new Date();
    const upcomingEvents = [];
    const pastEvents = [];

    snapshot.forEach((eventDocument) => {
        const eventData = eventDocument.data();
        const scheduleEvent = {
            id: eventDocument.id,
            data: eventData
        };
        const startsAt = eventData.startsAt?.toDate
            ? eventData.startsAt.toDate()
            : new Date(eventData.startsAt);

        if (startsAt >= now) {
            upcomingEvents.push(scheduleEvent);
        } else {
            pastEvents.push(scheduleEvent);
        }
    });

    upcomingEvents.forEach((scheduleEvent) => {
        upcomingScheduleList.appendChild(
            createScheduleCard(scheduleEvent.id, scheduleEvent.data, true)
        );
    });

    pastEvents.reverse().forEach((scheduleEvent) => {
        pastScheduleList.appendChild(
            createScheduleCard(scheduleEvent.id, scheduleEvent.data, false)
        );
    });

    if (upcomingEvents.length === 0) {
        upcomingScheduleList.innerHTML =
            '<p class="schedule-empty-message">No upcoming events have been scheduled.</p>';
    }

    if (pastEvents.length === 0) {
        pastScheduleList.innerHTML =
            '<p class="schedule-empty-message">No past events yet.</p>';
    }
}

function loadSchedule() {
    const scheduleQuery = query(
        collection(db, "teams", teamId, "scheduleEvents"),
        orderBy("startsAt", "asc")
    );

    unsubscribeFromSchedule = onSnapshot(
        scheduleQuery,
        renderSchedule,
        (error) => {
            console.error("Unable to load schedule:", error);
            upcomingScheduleList.innerHTML =
                '<p class="schedule-empty-message">Unable to load the schedule.</p>';
            showScheduleMessage(`${error.code || "Unknown error"}: ${error.message}`);
        }
    );
}

async function loadUserProfile(user) {
    try {
        const userSnapshot = await getDoc(doc(db, "users", user.uid));
        currentUserName = userSnapshot.exists()
            ? userSnapshot.data().name || user.email || "Team owner"
            : user.email || "Team owner";
    } catch (error) {
        console.error("Unable to load user profile:", error);
        currentUserName = user.email || "Team owner";
    }
}

async function loadTeam(user) {
    if (!teamId) {
        disableSchedulePage("No team was selected. Return to the dashboard.");
        return;
    }

    backToTeamFromSchedule.href =
        `TopGun-Team.html?teamId=${encodeURIComponent(teamId)}`;

    try {
        const teamSnapshot = await getDoc(doc(db, "teams", teamId));

        if (!teamSnapshot.exists()) {
            disableSchedulePage("This team could not be found.");
            return;
        }

        const teamData = teamSnapshot.data();
        const members = Array.isArray(teamData.members) ? teamData.members : [];

        if (!members.includes(user.uid)) {
            disableSchedulePage("You do not have permission to view this schedule.");
            return;
        }

        currentTeam = teamData;
        scheduleTeamName.textContent = teamData.teamName || "Team Schedule";

        if (teamData.createdBy === user.uid) {
            scheduleStatus.textContent = "You can create and view team events.";
            scheduleComposer.hidden = false;
        } else {
            scheduleStatus.textContent = "Upcoming games, practices, meetings, and tournaments.";
            scheduleComposer.hidden = true;
        }

        await markScheduleSeen();
        loadSchedule();
    } catch (error) {
        console.error("Unable to load schedule page:", error);
        disableSchedulePage("The schedule could not be loaded.");
        showScheduleMessage(`${error.code || "Unknown error"}: ${error.message}`);
    }
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "TopGun-Index.html";
        return;
    }

    currentUser = user;
    await loadUserProfile(user);
    await loadTeam(user);
});

createScheduleEventBtn.addEventListener("click", async () => {
    const type = scheduleEventType.value;
    const title = scheduleEventTitle.value.trim();
    const date = scheduleEventDate.value;
    const time = scheduleEventTime.value;
    const location = scheduleEventLocation.value.trim();
    const notes = scheduleEventNotes.value.trim();

    if (!currentUser || !currentTeam || !teamId) {
        showScheduleMessage("The schedule page is not ready.");
        return;
    }

    if (currentTeam.createdBy !== currentUser.uid) {
        showScheduleMessage("Only the team owner can create schedule events.");
        return;
    }

    if (!title) {
        showScheduleMessage("Please enter an opponent or event title.");
        scheduleEventTitle.focus();
        return;
    }

    if (!date || !time) {
        showScheduleMessage("Please select both a date and a time.");
        (date ? scheduleEventTime : scheduleEventDate).focus();
        return;
    }

    const startsAtDate = new Date(`${date}T${time}`);

    if (Number.isNaN(startsAtDate.getTime())) {
        showScheduleMessage("Please enter a valid date and time.");
        return;
    }

    createScheduleEventBtn.disabled = true;
    createScheduleEventBtn.textContent = currentEditingEventId
        ? "Saving Changes..."
        : "Adding Event...";

    try {
        if (currentEditingEventId) {
            const editingEventId = currentEditingEventId;

            await updateDoc(
                doc(db, "teams", teamId, "scheduleEvents", editingEventId),
                {
                    type,
                    title,
                    startsAt: Timestamp.fromDate(startsAtDate),
                    location,
                    notes,
                    updatedAt: serverTimestamp()
                }
            );

            await createTeamNotification(
                "schedule",
                `Event updated: ${title}`,
                editingEventId
            );

            showScheduleMessage("Event updated successfully.", "success");
        } else {
            const eventReference = await addDoc(
                collection(db, "teams", teamId, "scheduleEvents"),
                {
                type,
                title,
                startsAt: Timestamp.fromDate(startsAtDate),
                location,
                notes,
                createdBy: currentUser.uid,
                createdByName: currentUserName,
                createdAt: serverTimestamp()
                }
            );

            await createTeamNotification(
                "schedule",
                `New event: ${title}`,
                eventReference.id
            );

            showScheduleMessage("Event added successfully.", "success");
        }

        resetScheduleForm();
        scheduleEventTitle.focus();
    } catch (error) {
        console.error("Unable to create schedule event:", error);
        showScheduleMessage(`${error.code || "Unknown error"}: ${error.message}`);
    } finally {
        createScheduleEventBtn.disabled = false;
        createScheduleEventBtn.textContent = currentEditingEventId
            ? "Save Changes"
            : "Add Event";
    }
});

cancelScheduleEditBtn.addEventListener("click", () => {
    resetScheduleForm();
    showScheduleMessage("Editing canceled.", "success");
});

scheduleLogoutBtn.addEventListener("click", async () => {
    scheduleLogoutBtn.disabled = true;
    scheduleLogoutBtn.textContent = "Logging Out...";

    try {
        stopAttendanceListeners();

        if (unsubscribeFromSchedule) {
            unsubscribeFromSchedule();
        }

        await signOut(auth);
        window.location.href = "TopGun-Index.html";
    } catch (error) {
        console.error("Logout error:", error);
        showScheduleMessage("Unable to log out. Please try again.");
        scheduleLogoutBtn.disabled = false;
        scheduleLogoutBtn.textContent = "Logout";
    }
});

window.addEventListener("beforeunload", () => {
    stopAttendanceListeners();

    if (unsubscribeFromSchedule) {
        unsubscribeFromSchedule();
    }
});
