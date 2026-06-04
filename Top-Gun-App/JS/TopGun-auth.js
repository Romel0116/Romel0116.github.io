const registerBtn = document.getElementById("registerBtn");
const loginBtn = document.getElementById("loginBtn");
const message = document.getElementById("message");

registerBtn.addEventListener("click", () => {

    const name = document.getElementById("registerName").value;

    message.textContent =
        `Account creation coming soon. Welcome ${name}!`;

});

loginBtn.addEventListener("click", () => {

    const email = document.getElementById("loginEmail").value;

    message.textContent =
        `Login feature coming soon for ${email}`;

});