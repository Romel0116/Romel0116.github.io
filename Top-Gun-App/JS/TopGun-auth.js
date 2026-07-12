import { auth, db } from "./TopGun-firebase.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

import {
    doc,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const registerBtn = document.getElementById("registerBtn");
const loginBtn = document.getElementById("loginBtn");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const message = document.getElementById("message");

function showMessage(text, type = "error") {
    message.textContent = text;
    message.style.color = type === "success" ? "green" : "red";
}

function getFriendlyErrorMessage(errorCode) {
    switch (errorCode) {
        case "auth/email-already-in-use":
            return "An account already exists with that email.";

        case "auth/invalid-email":
            return "Please enter a valid email address.";

        case "auth/weak-password":
            return "Your password must contain at least 6 characters.";

        case "auth/invalid-credential":
            return "The email or password is incorrect.";

        case "auth/user-not-found":
            return "No account was found with that email.";

        case "auth/wrong-password":
            return "The email or password is incorrect.";

        case "auth/too-many-requests":
            return "Too many attempts. Please wait and try again.";

        case "auth/network-request-failed":
            return "A network error occurred. Check your internet connection.";

        default:
            return "Something went wrong. Please try again.";
    }
}

registerBtn.addEventListener("click", async () => {
    const name = document.getElementById("registerName").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value;

    if (!name || !email || !password) {
        showMessage("Please complete every account creation field.");
        return;
    }

    if (password.length < 6) {
        showMessage("Your password must contain at least 6 characters.");
        return;
    }

    registerBtn.disabled = true;
    registerBtn.textContent = "Creating Account...";

    try {
        const userCredential = await createUserWithEmailAndPassword(
            auth,
            email,
            password
        );

        await setDoc(doc(db, "users", userCredential.user.uid), {
            name,
            email,
            createdAt: new Date()
        });

        showMessage("Account created successfully!", "success");

        window.location.href = "TopGun-Dashboard.html";
    } catch (error) {
        console.error("Registration error:", error);

showMessage(
    `${error.code || "Unknown error"}: ${error.message}`
);
    } finally {
        registerBtn.disabled = false;
        registerBtn.textContent = "Create Account";
    }
});

loginBtn.addEventListener("click", async () => {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
        showMessage("Please enter your email and password.");
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = "Logging In...";

    try {
        const userCredential = await signInWithEmailAndPassword(
    auth,
    email,
    password
);

const userReference = doc(
    db,
    "users",
    userCredential.user.uid
);

await setDoc(
    userReference,
    {
        email: userCredential.user.email,
        updatedAt: new Date()
    },
    { merge: true }
);

window.location.href = "TopGun-Dashboard.html";
    } catch (error) {
        showMessage(getFriendlyErrorMessage(error.code));
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = "Login";
    }
});

forgotPasswordBtn.addEventListener("click", async () => {
    const email = document.getElementById("loginEmail").value.trim();

    if (!email) {
        showMessage(
            "Enter your email in the Login section before requesting a reset."
        );
        return;
    }

    forgotPasswordBtn.disabled = true;
    forgotPasswordBtn.textContent = "Sending Reset Email...";

    try {
        await sendPasswordResetEmail(auth, email);

        showMessage(
            "Password reset email sent. Check your inbox and spam folder.",
            "success"
        );
    } catch (error) {
        showMessage(getFriendlyErrorMessage(error.code));
    } finally {
        forgotPasswordBtn.disabled = false;
        forgotPasswordBtn.textContent = "Forgot Password?";
    }
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        window.location.href = "TopGun-Dashboard.html";
    }
});