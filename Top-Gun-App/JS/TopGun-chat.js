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
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const chatTeamName = document.getElementById("chatTeamName");
const chatMemberStatus = document.getElementById("chatMemberStatus");
const chatMessages = document.getElementById("chatMessages");
const chatMessageInput = document.getElementById("chatMessageInput");
const sendMessageBtn = document.getElementById("sendMessageBtn");
const backToTeamFromChat = document.getElementById("backToTeamFromChat");
const chatLogoutBtn = document.getElementById("chatLogoutBtn");
const chatPageMessage = document.getElementById("chatPageMessage");

const urlParameters = new URLSearchParams(window.location.search);
const teamId = urlParameters.get("teamId");

let currentUser = null;
let currentUserName = "";
let currentTeam = null;
let unsubscribeFromMessages = null;

function showChatMessage(text, type = "error") {
    chatPageMessage.textContent = text;
    chatPageMessage.style.color = type === "success" ? "#0c6e3d" : "#b42318";
}

function disableChat(message) {
    chatTeamName.textContent = "Chat unavailable";
    chatMemberStatus.textContent = "";
    chatMessages.innerHTML = "";

    const emptyMessage = document.createElement("p");
    emptyMessage.className = "chat-empty-message";
    emptyMessage.textContent = message;
    chatMessages.appendChild(emptyMessage);

    chatMessageInput.disabled = true;
    sendMessageBtn.disabled = true;
}

function formatMessageTime(timestamp) {
    if (!timestamp) {
        return "Sending...";
    }

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

function createMessageElement(messageData) {
    const messageArticle = document.createElement("article");
    messageArticle.className = "chat-message";

    if (messageData.senderId === currentUser.uid) {
        messageArticle.classList.add("own-chat-message");
    }

    const messageHeader = document.createElement("div");
    messageHeader.className = "chat-message-header";

    const senderName = document.createElement("strong");
    senderName.textContent =
        messageData.senderName || messageData.senderEmail || "Team member";

    const timestamp = document.createElement("time");
    timestamp.textContent = formatMessageTime(messageData.createdAt);
    messageHeader.append(senderName, timestamp);

    const messageText = document.createElement("p");
    messageText.textContent = messageData.text || "";

    messageArticle.append(messageHeader, messageText);
    return messageArticle;
}

async function markChatSeen() {
    if (!currentUser || !teamId) {
        return;
    }

    try {
        await setDoc(
            doc(db, "teams", teamId, "memberReadStatus", currentUser.uid),
            {
                userId: currentUser.uid,
                chatSeenAt: serverTimestamp()
            },
            { merge: true }
        );
    } catch (error) {
        console.error("Unable to mark Team Chat as viewed:", error);
    }
}

function loadMessages() {
    const messagesQuery = query(
        collection(db, "teams", teamId, "messages"),
        orderBy("createdAt", "asc")
    );

    unsubscribeFromMessages = onSnapshot(
        messagesQuery,
        (snapshot) => {
            markChatSeen();
            chatMessages.innerHTML = "";

            if (snapshot.empty) {
                chatMessages.innerHTML =
                    '<p class="chat-empty-message">No messages yet. Start the conversation.</p>';
                return;
            }

            snapshot.forEach((messageDocument) => {
                chatMessages.appendChild(
                    createMessageElement(messageDocument.data())
                );
            });

            chatMessages.scrollTop = chatMessages.scrollHeight;
        },
        (error) => {
            console.error("Unable to load messages:", error);
            showChatMessage(`${error.code || "Unknown error"}: ${error.message}`);
        }
    );
}

async function loadUserProfile(user) {
    try {
        const profileSnapshot = await getDoc(doc(db, "users", user.uid));
        currentUserName = profileSnapshot.exists()
            ? profileSnapshot.data().name || user.email || "Team member"
            : user.email || "Team member";
    } catch (error) {
        console.error("Unable to load user profile:", error);
        currentUserName = user.email || "Team member";
    }
}

async function loadTeam(user) {
    if (!teamId) {
        disableChat("No team was selected. Return to the dashboard.");
        return;
    }

    backToTeamFromChat.href =
        `TopGun-Team.html?teamId=${encodeURIComponent(teamId)}`;

    try {
        const teamSnapshot = await getDoc(doc(db, "teams", teamId));

        if (!teamSnapshot.exists()) {
            disableChat("This team could not be found.");
            return;
        }

        const teamData = teamSnapshot.data();
        const members = Array.isArray(teamData.members) ? teamData.members : [];

        if (!members.includes(user.uid)) {
            disableChat("You do not have permission to view this chat.");
            return;
        }

        currentTeam = teamData;
        chatTeamName.textContent = teamData.teamName;
        chatMemberStatus.textContent = `Signed in as ${currentUserName}`;

        await markChatSeen();
        loadMessages();
    } catch (error) {
        console.error("Unable to load team chat:", error);
        disableChat("The team chat could not be loaded.");
        showChatMessage(`${error.code || "Unknown error"}: ${error.message}`);
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

sendMessageBtn.addEventListener("click", async () => {
    const messageText = chatMessageInput.value.trim();

    if (!currentUser || !currentTeam || !teamId) {
        showChatMessage("The chat is not ready yet.");
        return;
    }

    if (!messageText) {
        chatMessageInput.focus();
        return;
    }

    sendMessageBtn.disabled = true;
    sendMessageBtn.textContent = "Sending...";

    try {
        await addDoc(collection(db, "teams", teamId, "messages"), {
            text: messageText,
            senderId: currentUser.uid,
            senderName: currentUserName,
            senderEmail: currentUser.email || "",
            createdAt: serverTimestamp()
        });

        chatMessageInput.value = "";
        chatMessageInput.focus();
    } catch (error) {
        console.error("Unable to send message:", error);
        showChatMessage(`${error.code || "Unknown error"}: ${error.message}`);
    } finally {
        sendMessageBtn.disabled = false;
        sendMessageBtn.textContent = "Send";
    }
});

chatMessageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessageBtn.click();
    }
});

chatLogoutBtn.addEventListener("click", async () => {
    chatLogoutBtn.disabled = true;
    chatLogoutBtn.textContent = "Logging Out...";

    try {
        if (unsubscribeFromMessages) {
            unsubscribeFromMessages();
        }

        await signOut(auth);
        window.location.href = "TopGun-Index.html";
    } catch (error) {
        console.error("Logout error:", error);
        showChatMessage("Unable to log out. Please try again.");
        chatLogoutBtn.disabled = false;
        chatLogoutBtn.textContent = "Logout";
    }
});

window.addEventListener("beforeunload", () => {
    if (unsubscribeFromMessages) {
        unsubscribeFromMessages();
    }
});
