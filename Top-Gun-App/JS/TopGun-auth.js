import { auth, db } from "./TopGun-firebase.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

import {
    doc,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const registerBtn = document.getElementById("registerBtn");
const loginBtn = document.getElementById("loginBtn");
const message = document.getElementById("message");

registerBtn.addEventListener("click", async () => {

    const name = document.getElementById("registerName").value;
    const email = document.getElementById("registerEmail").value;
    const password = document.getElementById("registerPassword").value;

    try {

        const userCredential =
            await createUserWithEmailAndPassword(
                auth,
                email,
                password
            );

        await setDoc(
            doc(db, "users", userCredential.user.uid),
            {
                name: name,
                email: email,
                createdAt: new Date()
            }
        );

        message.style.color = "green";
        message.textContent = "Account created successfully!";

        window.location.href = "TopGun-Dashboard.html";

    } catch (error) {

        message.style.color = "red";
        message.textContent = error.message;

    }

});

loginBtn.addEventListener("click", async () => {

    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    try {

        await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

        window.location.href = "TopGun-Dashboard.html";

    } catch (error) {

        message.style.color = "red";
        message.textContent = error.message;

    }

});

    try {

        const userCredential =
            await createUserWithEmailAndPassword(
                auth,
                email,
                password
            );

        await setDoc(
            doc(db, "users", userCredential.user.uid),
            {
                name: name,
                email: email,
                createdAt: new Date()
            }
        );

        message.style.color = "green";
        message.textContent = "Account created successfully!";

        window.location.href = "TopGun-Dashboard.html";

    } catch (error) {

        message.style.color = "red";
        message.textContent = error.message;

    }

});

loginBtn.addEventListener("click", async () => {

    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    try {

        await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

        window.location.href = "TopGun-Dashboard.html";

    } catch (error) {

        message.style.color = "red";
        message.textContent = error.message;

    }

});