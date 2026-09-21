import { auth, db } from "./TopGun-firebase.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

import {
    doc,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const registerForm = document.getElementById("registerForm");
const registerBtn = document.getElementById("registerBtn");
const loginForm = document.getElementById("loginForm");
const loginBtn = document.getElementById("loginBtn");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const message = document.getElementById("message");

function showMessage(text, type = "error") {
    if (!message) {
        return;
    }

    message.textContent = text;
    message.classList.toggle("success", type === "success");
    message.classList.toggle("error", type !== "success");
}

function getFriendlyErrorMessage(errorCode) {
    switch (errorCode) {
        case "auth/email-already-in-use":
            return "An account already exists with that email. Try logging in instead.";

        case "auth/invalid-email":
            return "Please enter a valid email address.";

        case "auth/weak-password":
            return "Your password must contain at least 6 characters.";

        case "auth/invalid-credential":
        case "auth/user-not-found":
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

function showAccountCreatedConfirmation() {
    const parameters = new URLSearchParams(window.location.search);

    if (parameters.get("accountCreated") !== "true") {
        return;
    }

    showMessage(
        "Your account was created successfully. You can now log in.",
        "success"
    );

    window.history.replaceState({}, document.title, "TopGun-Login.html");
}

if (registerForm && registerBtn) {
    registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const firstName = document
            .getElementById("registerFirstName")
            .value.trim();
        const lastName = document
            .getElementById("registerLastName")
            .value.trim();
        const email = document.getElementById("registerEmail").value.trim();
        const password = document.getElementById("registerPassword").value;

        if (!firstName || !lastName || !email || !password) {
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

            const name = `${firstName} ${lastName}`;

            await setDoc(doc(db, "users", userCredential.user.uid), {
                firstName,
                lastName,
                name,
                email,
                createdAt: new Date()
            });

            await signOut(auth);

            window.location.replace(
                "TopGun-Login.html?accountCreated=true"
            );
        } catch (error) {
            console.error("Registration error:", error);
            showMessage(getFriendlyErrorMessage(error.code));

            registerBtn.disabled = false;
            registerBtn.textContent = "Create Account";
        }
    });
}

if (loginForm && loginBtn) {
    showAccountCreatedConfirmation();

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

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

            await setDoc(
                doc(db, "users", userCredential.user.uid),
                {
                    email: userCredential.user.email,
                    updatedAt: new Date()
                },
                { merge: true }
            );

            window.location.replace("TopGun-Dashboard.html");
        } catch (error) {
            console.error("Login error:", error);
            showMessage(getFriendlyErrorMessage(error.code));

            loginBtn.disabled = false;
            loginBtn.textContent = "Log In";
        }
    });
}

if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", async () => {
        const email = document.getElementById("loginEmail").value.trim();

        if (!email) {
            showMessage(
                "Enter your email above before requesting a password reset."
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
            console.error("Password reset error:", error);
            showMessage(getFriendlyErrorMessage(error.code));
        } finally {
            forgotPasswordBtn.disabled = false;
            forgotPasswordBtn.textContent = "Forgot Password?";
        }
    });
}
