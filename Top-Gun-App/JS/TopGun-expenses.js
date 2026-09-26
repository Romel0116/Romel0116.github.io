import { auth, db } from "./TopGun-firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    Timestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const CATEGORY_LABELS = {
    soccer_balls: "Soccer Balls",
    jerseys_uniforms: "Jerseys and Uniforms",
    field_rental: "Field or Practice Rental",
    league_registration: "League Registration",
    referee_fees: "Referee Fees",
    equipment: "Equipment",
    tournament_fees: "Tournament Fees",
    insurance: "Insurance",
    website_software: "Website or Software",
    other: "Other"
};

const PAYMENT_METHOD_LABELS = {
    cash: "Cash",
    venmo: "Venmo",
    credit_card: "Credit Card",
    debit_card: "Debit Card",
    check: "Check",
    bank_transfer: "Bank Transfer",
    other: "Other"
};

const expenseAccessStatus = document.getElementById("expenseAccessStatus");
const expenseFormCard = document.getElementById("expenseFormCard");
const expenseReportCard = document.getElementById("expenseReportCard");
const expenseForm = document.getElementById("expenseForm");
const expenseFormHeading = document.getElementById("expenseFormHeading");
const expenseDescription = document.getElementById("expenseDescription");
const expenseCategory = document.getElementById("expenseCategory");
const customCategoryField = document.getElementById("customCategoryField");
const expenseCustomCategory = document.getElementById("expenseCustomCategory");
const expenseAmount = document.getElementById("expenseAmount");
const expenseDate = document.getElementById("expenseDate");
const expenseTeam = document.getElementById("expenseTeam");
const expenseVendor = document.getElementById("expenseVendor");
const expensePaymentMethod = document.getElementById("expensePaymentMethod");
const expensePaidBy = document.getElementById("expensePaidBy");
const expenseNotes = document.getElementById("expenseNotes");
const saveExpenseBtn = document.getElementById("saveExpenseBtn");
const cancelExpenseEditBtn = document.getElementById("cancelExpenseEditBtn");
const expenseFilterStart = document.getElementById("expenseFilterStart");
const expenseFilterEnd = document.getElementById("expenseFilterEnd");
const expenseFilterCategory = document.getElementById("expenseFilterCategory");
const expenseFilterTeam = document.getElementById("expenseFilterTeam");
const resetExpenseFiltersBtn = document.getElementById("resetExpenseFiltersBtn");
const expenseVisibleCount = document.getElementById("expenseVisibleCount");
const expenseVisibleTotal = document.getElementById("expenseVisibleTotal");
const expenseList = document.getElementById("expenseList");
const exportExpensesExcelBtn = document.getElementById("exportExpensesExcelBtn");
const exportExpensesPdfBtn = document.getElementById("exportExpensesPdfBtn");
const expensesLogoutBtn = document.getElementById("expensesLogoutBtn");
const expensesPageMessage = document.getElementById("expensesPageMessage");

let currentUser = null;
let currentUserName = "Team Admin";
let allExpenses = [];
let filteredExpenses = [];
let editingExpenseId = null;
let unsubscribeFromExpenses = null;

function showMessage(text, type = "error") {
    expensesPageMessage.textContent = text;
    expensesPageMessage.classList.toggle("success", type === "success");
}

function todayInputValue() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function timestampFromDateInput(value) {
    return Timestamp.fromDate(new Date(`${value}T12:00:00`));
}

function dateInputFromTimestamp(timestamp) {
    if (!timestamp || typeof timestamp.toDate !== "function") {
        return "";
    }

    const date = timestamp.toDate();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function displayDate(timestamp) {
    if (!timestamp || typeof timestamp.toDate !== "function") {
        return "Unknown date";
    }

    return timestamp.toDate().toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function currency(amountCents) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD"
    }).format((amountCents || 0) / 100);
}

function categoryLabel(expense) {
    if (expense.category === "other") {
        return expense.customCategory || "Other";
    }

    return CATEGORY_LABELS[expense.category] || expense.category || "Other";
}

function paymentMethodLabel(value) {
    return PAYMENT_METHOD_LABELS[value] || value || "Not specified";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function selectedTeam() {
    const selectedOption = expenseTeam.options[expenseTeam.selectedIndex];
    return {
        teamId: expenseTeam.value,
        teamName: expenseTeam.value ? selectedOption.textContent : "Organization-wide"
    };
}

function resetForm() {
    editingExpenseId = null;
    expenseForm.reset();
    expenseDate.value = todayInputValue();
    customCategoryField.hidden = true;
    expenseCustomCategory.required = false;
    expenseFormHeading.textContent = "Add an Expense";
    saveExpenseBtn.textContent = "Add Expense";
    cancelExpenseEditBtn.hidden = true;
}

function expenseFormData() {
    const amount = Number.parseFloat(expenseAmount.value);
    const team = selectedTeam();
    const customCategory = expenseCustomCategory.value.trim();

    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Enter an expense amount greater than zero.");
    }

    if (expenseCategory.value === "other" && !customCategory) {
        throw new Error("Enter the custom category name.");
    }

    return {
        description: expenseDescription.value.trim(),
        category: expenseCategory.value,
        customCategory: expenseCategory.value === "other" ? customCategory : "",
        amountCents: Math.round(amount * 100),
        expenseDate: timestampFromDateInput(expenseDate.value),
        teamId: team.teamId,
        teamName: team.teamName,
        vendor: expenseVendor.value.trim(),
        paymentMethod: expensePaymentMethod.value,
        paidBy: expensePaidBy.value.trim(),
        notes: expenseNotes.value.trim()
    };
}

function beginEdit(expense) {
    editingExpenseId = expense.id;
    expenseDescription.value = expense.description;
    expenseCategory.value = expense.category;
    expenseCustomCategory.value = expense.customCategory || "";
    customCategoryField.hidden = expense.category !== "other";
    expenseCustomCategory.required = expense.category === "other";
    expenseAmount.value = ((expense.amountCents || 0) / 100).toFixed(2);
    expenseDate.value = dateInputFromTimestamp(expense.expenseDate);
    expenseTeam.value = expense.teamId || "";
    expenseVendor.value = expense.vendor || "";
    expensePaymentMethod.value = expense.paymentMethod;
    expensePaidBy.value = expense.paidBy || "";
    expenseNotes.value = expense.notes || "";
    expenseFormHeading.textContent = "Edit Expense";
    saveExpenseBtn.textContent = "Save Changes";
    cancelExpenseEditBtn.hidden = false;
    expenseFormCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function removeExpense(expense) {
    const confirmed = window.confirm(
        `Delete "${expense.description}" for ${currency(expense.amountCents)}?`
    );

    if (!confirmed) {
        return;
    }

    try {
        await deleteDoc(doc(db, "expenses", expense.id));
        showMessage("Expense deleted.", "success");
    } catch (error) {
        console.error("Unable to delete expense:", error);
        showMessage(`${error.code || "Unknown error"}: ${error.message}`);
    }
}

function renderExpenses() {
    expenseList.innerHTML = "";

    const totalCents = filteredExpenses.reduce(
        (total, expense) => total + (expense.amountCents || 0),
        0
    );

    expenseVisibleCount.textContent = String(filteredExpenses.length);
    expenseVisibleTotal.textContent = currency(totalCents);
    exportExpensesExcelBtn.disabled = filteredExpenses.length === 0;
    exportExpensesPdfBtn.disabled = filteredExpenses.length === 0;

    if (filteredExpenses.length === 0) {
        expenseList.innerHTML =
            '<p class="expense-empty-message">No expenses match the current filters.</p>';
        return;
    }

    filteredExpenses.forEach((expense) => {
        const record = document.createElement("article");
        record.className = "expense-record";

        record.innerHTML = `
            <div class="expense-record-header">
                <div>
                    <span class="expense-category-badge">${escapeHtml(categoryLabel(expense))}</span>
                    <h3>${escapeHtml(expense.description)}</h3>
                </div>
                <span class="expense-record-amount">${currency(expense.amountCents)}</span>
            </div>
            <div class="expense-record-details">
                <span><strong>Date:</strong> ${escapeHtml(displayDate(expense.expenseDate))}</span>
                <span><strong>Team:</strong> ${escapeHtml(expense.teamName || "Organization-wide")}</span>
                <span><strong>Payment:</strong> ${escapeHtml(paymentMethodLabel(expense.paymentMethod))}</span>
                <span><strong>Vendor:</strong> ${escapeHtml(expense.vendor || "—")}</span>
                <span><strong>Paid by:</strong> ${escapeHtml(expense.paidBy || "—")}</span>
                <span><strong>Entered by:</strong> ${escapeHtml(expense.createdByName || "Team Admin")}</span>
            </div>
            ${expense.notes
                ? `<p class="expense-record-notes">${escapeHtml(expense.notes)}</p>`
                : ""}
        `;

        const actions = document.createElement("div");
        actions.className = "expense-record-actions";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "secondary-button";
        editButton.textContent = "Edit";
        editButton.addEventListener("click", () => beginEdit(expense));

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "expense-delete-button";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", () => removeExpense(expense));

        actions.append(editButton, deleteButton);
        record.appendChild(actions);
        expenseList.appendChild(record);
    });
}

function applyFilters() {
    const start = expenseFilterStart.value;
    const end = expenseFilterEnd.value;
    const category = expenseFilterCategory.value;
    const team = expenseFilterTeam.value;

    filteredExpenses = allExpenses.filter((expense) => {
        const date = dateInputFromTimestamp(expense.expenseDate);

        if (start && date < start) {
            return false;
        }

        if (end && date > end) {
            return false;
        }

        if (category && expense.category !== category) {
            return false;
        }

        if (team === "organization" && expense.teamId) {
            return false;
        }

        if (team && team !== "organization" && expense.teamId !== team) {
            return false;
        }

        return true;
    });

    renderExpenses();
}

function exportRows() {
    return filteredExpenses.map((expense) => ({
        Date: expense.expenseDate.toDate(),
        Description: expense.description,
        Category: categoryLabel(expense),
        Amount: (expense.amountCents || 0) / 100,
        Team: expense.teamName || "Organization-wide",
        Vendor: expense.vendor || "",
        "Payment Method": paymentMethodLabel(expense.paymentMethod),
        "Paid By": expense.paidBy || "",
        Notes: expense.notes || "",
        "Entered By": expense.createdByName || "Team Admin"
    }));
}

async function exportExcel() {
    if (filteredExpenses.length === 0) {
        showMessage("There are no visible expenses to export.");
        return;
    }

    try {
        if (!window.ExcelJS) {
            throw new Error("The Excel export library did not load.");
        }

        const workbook = new window.ExcelJS.Workbook();
        workbook.creator = "Top Gun Soccer App";
        workbook.created = new Date();

        const worksheet = workbook.addWorksheet("Expenses", {
            views: [
                {
                    state: "frozen",
                    ySplit: 1
                }
            ]
        });

        worksheet.columns = [
            { header: "Date", key: "Date", width: 14 },
            { header: "Description", key: "Description", width: 32 },
            { header: "Category", key: "Category", width: 25 },
            { header: "Amount", key: "Amount", width: 14 },
            { header: "Team", key: "Team", width: 25 },
            { header: "Vendor", key: "Vendor", width: 22 },
            { header: "Payment Method", key: "Payment Method", width: 19 },
            { header: "Paid By", key: "Paid By", width: 20 },
            { header: "Notes", key: "Notes", width: 38 },
            { header: "Entered By", key: "Entered By", width: 22 }
        ];

        worksheet.addRows(exportRows());

        const headerRow = worksheet.getRow(1);
        headerRow.height = 24;
        headerRow.font = {
            name: "Aptos",
            size: 11,
            bold: true,
            underline: true,
            color: { argb: "FFFFFFFF" }
        };
        headerRow.alignment = {
            vertical: "middle",
            horizontal: "center"
        };

        headerRow.eachCell((cell) => {
            cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FF1F7A45" }
            };
            cell.border = {
                bottom: {
                    style: "thin",
                    color: { argb: "FF70AD86" }
                }
            };
        });

        worksheet.autoFilter = {
            from: "A1",
            to: "J1"
        };

        worksheet.getColumn(1).numFmt = "mm/dd/yy";
        worksheet.getColumn(4).numFmt = '"$"#,##0.00';

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                row.alignment = {
                    vertical: "top"
                };
            }
        });

        worksheet.getColumn(4).eachCell((cell, rowNumber) => {
            if (rowNumber > 1) {
                cell.alignment = {
                    vertical: "top",
                    horizontal: "right"
                };
            }
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const downloadUrl = URL.createObjectURL(
            new Blob(
                [buffer],
                {
                    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                }
            )
        );

        const downloadLink = document.createElement("a");
        downloadLink.href = downloadUrl;
        downloadLink.download = `Top-Gun-Expenses-${todayInputValue()}.xlsx`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);

        showMessage("Excel expense sheet downloaded.", "success");
    } catch (error) {
        console.error("Unable to export Excel file:", error);
        showMessage("Unable to create the Excel file. Please try again.");
    }
}

function exportPdf() {
    if (filteredExpenses.length === 0) {
        showMessage("There are no visible expenses to export.");
        return;
    }

    const totalCents = filteredExpenses.reduce(
        (total, expense) => total + (expense.amountCents || 0),
        0
    );

    const rows = filteredExpenses.map((expense) => `
        <tr>
            <td>${escapeHtml(dateInputFromTimestamp(expense.expenseDate))}</td>
            <td>${escapeHtml(expense.description)}</td>
            <td>${escapeHtml(categoryLabel(expense))}</td>
            <td>${escapeHtml(expense.teamName || "Organization-wide")}</td>
            <td class="amount">${escapeHtml(currency(expense.amountCents))}</td>
        </tr>
    `).join("");

    const reportWindow = window.open("", "_blank");

    if (!reportWindow) {
        showMessage("Allow pop-ups for this site to export the PDF.");
        return;
    }

    reportWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Top Gun Expense Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 32px; color: #172b21; }
                h1 { color: #0c6e3d; margin-bottom: 6px; }
                p { color: #53645b; }
                table { width: 100%; border-collapse: collapse; margin-top: 22px; }
                th, td { border: 1px solid #cbd8d0; padding: 9px; text-align: left; }
                th { background: #eaf5ef; color: #17452f; }
                .amount { text-align: right; white-space: nowrap; }
                .total { margin-top: 18px; text-align: right; font-size: 1.15rem; font-weight: bold; }
                @page { size: landscape; margin: 0.5in; }
            </style>
        </head>
        <body>
            <h1>Top Gun Soccer App Expense Report</h1>
            <p>Generated ${escapeHtml(new Date().toLocaleString())}</p>
            <table>
                <thead>
                    <tr><th>Date</th><th>Description</th><th>Category</th><th>Team</th><th>Amount</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            <p class="total">Total: ${escapeHtml(currency(totalCents))}</p>
            <script>window.addEventListener("load", () => window.print());</script>
        </body>
        </html>
    `);
    reportWindow.document.close();
    showMessage("Use the print window's Save as PDF option.", "success");
}

async function loadTeams() {
    const snapshot = await getDocs(query(collection(db, "teams")));
    const teams = snapshot.docs
        .map((teamDocument) => ({
            id: teamDocument.id,
            name: teamDocument.data().teamName || "Unnamed Team"
        }))
        .sort((first, second) => first.name.localeCompare(second.name));

    teams.forEach((team) => {
        const formOption = document.createElement("option");
        formOption.value = team.id;
        formOption.textContent = team.name;
        expenseTeam.appendChild(formOption);

        const filterOption = document.createElement("option");
        filterOption.value = team.id;
        filterOption.textContent = team.name;
        expenseFilterTeam.appendChild(filterOption);
    });
}

function listenForExpenses() {
    const expensesQuery = query(
        collection(db, "expenses"),
        orderBy("expenseDate", "desc")
    );

    unsubscribeFromExpenses = onSnapshot(
        expensesQuery,
        (snapshot) => {
            allExpenses = snapshot.docs.map((expenseDocument) => ({
                id: expenseDocument.id,
                ...expenseDocument.data()
            }));
            applyFilters();
        },
        (error) => {
            console.error("Unable to load expenses:", error);
            showMessage(`${error.code || "Unknown error"}: ${error.message}`);
        }
    );
}

Object.entries(CATEGORY_LABELS).forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    expenseFilterCategory.appendChild(option);
});

expenseDate.value = todayInputValue();

expenseCategory.addEventListener("change", () => {
    const custom = expenseCategory.value === "other";
    customCategoryField.hidden = !custom;
    expenseCustomCategory.required = custom;

    if (!custom) {
        expenseCustomCategory.value = "";
    }
});

expenseForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser) {
        showMessage("Your session has expired. Please log in again.");
        return;
    }

    saveExpenseBtn.disabled = true;
    saveExpenseBtn.textContent = editingExpenseId
        ? "Saving Changes..."
        : "Adding Expense...";

    try {
        const data = expenseFormData();

        if (editingExpenseId) {
            await updateDoc(doc(db, "expenses", editingExpenseId), {
                ...data,
                updatedBy: currentUser.uid,
                updatedAt: serverTimestamp()
            });
            showMessage("Expense updated.", "success");
        } else {
            await addDoc(collection(db, "expenses"), {
                ...data,
                createdBy: currentUser.uid,
                createdByName: currentUserName,
                createdAt: serverTimestamp()
            });
            showMessage("Expense added.", "success");
        }

        resetForm();
    } catch (error) {
        console.error("Unable to save expense:", error);
        showMessage(error.message || "Unable to save the expense.");
    } finally {
        saveExpenseBtn.disabled = false;
        saveExpenseBtn.textContent = editingExpenseId
            ? "Save Changes"
            : "Add Expense";
    }
});

cancelExpenseEditBtn.addEventListener("click", resetForm);

[
    expenseFilterStart,
    expenseFilterEnd,
    expenseFilterCategory,
    expenseFilterTeam
].forEach((control) => control.addEventListener("change", applyFilters));

resetExpenseFiltersBtn.addEventListener("click", () => {
    expenseFilterStart.value = "";
    expenseFilterEnd.value = "";
    expenseFilterCategory.value = "";
    expenseFilterTeam.value = "";
    applyFilters();
});

exportExpensesExcelBtn.addEventListener("click", exportExcel);
exportExpensesPdfBtn.addEventListener("click", exportPdf);

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("TopGun-Login.html");
        return;
    }

    currentUser = user;

    try {
        const profileSnapshot = await getDoc(doc(db, "users", user.uid));
        const profile = profileSnapshot.exists() ? profileSnapshot.data() : {};

        if (profile.appRole !== "admin") {
            window.location.replace("TopGun-Dashboard.html");
            return;
        }

        currentUserName = profile.name || user.email || "Team Admin";
        expenseAccessStatus.textContent =
            `Signed in as ${currentUserName} — Team Admin access`;
        expenseFormCard.hidden = false;
        expenseReportCard.hidden = false;

        await loadTeams();
        listenForExpenses();
    } catch (error) {
        console.error("Unable to open Expense Sheet:", error);
        showMessage(`${error.code || "Unknown error"}: ${error.message}`);
    }
});

expensesLogoutBtn.addEventListener("click", async () => {
    expensesLogoutBtn.disabled = true;
    expensesLogoutBtn.textContent = "Logging Out...";

    try {
        if (unsubscribeFromExpenses) {
            unsubscribeFromExpenses();
        }

        await signOut(auth);
        window.location.replace("TopGun-Login.html");
    } catch (error) {
        console.error("Logout error:", error);
        showMessage("Unable to log out. Please try again.");
        expensesLogoutBtn.disabled = false;
        expensesLogoutBtn.textContent = "Logout";
    }
});

window.addEventListener("beforeunload", () => {
    if (unsubscribeFromExpenses) {
        unsubscribeFromExpenses();
    }
});
