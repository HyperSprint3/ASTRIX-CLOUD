
"use strict";

/* ==========================================================
   ASTRIX CLOUD — CONTROL PANEL
   Authentication • Navigation • Tickets • Account
   Owner Dashboard • Team Management
   ========================================================== */

/* ================= API CONFIGURATION ================= */

const API = {
    login: "/api/login",
    logout: "/api/logout",
    me: "/api/me",
    sendVerification: "/api/send-verification",
    verifySignup: "/api/verify-signup",
    tickets: "/api/tickets",
    ticketReplies: "/api/ticket-replies",
    ticketStatus: "/api/ticket-status",
    ownerStats: "/api/owner-stats",
    teamUsers: "/api/team-users"
};

/* ================= APPLICATION STATE ================= */

const App = {
    user: null,
    tickets: [],
    teamAccounts: [],
    currentPage: "home",
    pendingSignupEmail: "",
    loading: false
};

const STAFF_ROLES = ["owner", "admin", "staff"];

const PAGE_TITLES = {
    home: "Home",
    overview: "Server Console",
    files: "Files",
    databases: "Databases",
    schedules: "Schedules",
    users: "Users",
    backups: "Backups",
    network: "Network",
    startup: "Startup",
    settings: "Server Settings",
    activity: "Activity",
    tickets: "Support Tickets",
    account: "My Account",
    admin: "Administration",
    "all-servers": "All Servers",
    "manage-users": "Manage Users",
    "team-management": "Team Management",
    "manage-tickets": "Manage Tickets"
};

/* ================= DOM HELPERS ================= */

const $ = (selector, root = document) =>
    root.querySelector(selector);

const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

function byId(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const element = byId(id);
    if (element) element.textContent = value ?? "";
}

function showMessage(id, message, type = "info") {
    const element = byId(id);
    if (!element) return;

    element.textContent = message || "";
    element.dataset.type = type;

    element.style.color =
        type === "error" ? "#ff7188" :
        type === "success" ? "#39d99a" :
        "#aaa9c0";
}

function setButtonLoading(button, loading, label) {
    if (!button) return;

    if (loading) {
        button.dataset.originalText = button.textContent.trim();
        button.disabled = true;
        button.textContent = label || "Please wait...";
    } else {
        button.disabled = false;

        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }
}

function initials(name) {
    return String(name || "AC")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part.charAt(0).toUpperCase())
        .join("") || "AC";
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function formatDate(value) {
    if (!value) return "Unknown date";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString();
}

function normalizeArray(result, key) {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.[key])) return result[key];
    if (Array.isArray(result?.data)) return result.data;
    if (Array.isArray(result?.data?.[key])) return result.data[key];

    return [];
}

/* ================= API REQUESTS ================= */

async function apiRequest(url, options = {}) {
    const config = {
        method: options.method || "GET",
        credentials: "same-origin",
        headers: {
            Accept: "application/json",
            ...(options.headers || {})
        }
    };

    if (options.body !== undefined) {
        config.headers["Content-Type"] = "application/json";
        config.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, config);

    let result = {};

    try {
        result = await response.json();
    } catch {
        result = {};
    }

    if (!response.ok) {
        const error = new Error(
            result.error ||
            result.message ||
            `Request failed (${response.status})`
        );

        error.status = response.status;
        throw error;
    }

    return result;
}

function extractUser(result) {
    return result?.user ||
        result?.data?.user ||
        result?.data ||
        result;
}

function requireUser() {
    if (!App.user) {
        throw new Error("Please sign in first.");
    }

    return App.user;
}

function isStaff() {
    return STAFF_ROLES.includes(
        String(App.user?.role || "").toLowerCase()
    );
}

function isOwner() {
    return String(App.user?.role || "").toLowerCase() === "owner";
}

/* ================= AUTHENTICATION ================= */

function showAuthForm(formId) {
    ["loginForm", "signupForm", "verifyForm"].forEach(id => {
        const form = byId(id);
        if (form) form.hidden = id !== formId;
    });

    $$(".form-message").forEach(element => {
        element.textContent = "";
    });
}

async function login(email, password) {
    const result = await apiRequest(API.login, {
        method: "POST",
        body: { email, password }
    });

    let user = extractUser(result);

    if (!user?.id) {
        const me = await apiRequest(API.me);
        user = extractUser(me);
    }

    if (!user?.id) {
        throw new Error("Login succeeded but account details could not be loaded.");
    }

    await startSession(user);
}

async function startSession(user) {
    App.user = user;

    const loginPage = byId("loginPage");
    const dashboard = byId("dashboard");

    if (loginPage) loginPage.hidden = true;
    if (dashboard) dashboard.hidden = false;

    updateUserInterface();
    applyRolePermissions();
    navigate("home");

    loadMyTickets();

    if (isOwner()) {
        loadOwnerStats();
        loadTeamAccounts();
    }

    refreshIcons();
}

async function checkSession() {
    try {
        const result = await apiRequest(API.me);
        const user = extractUser(result);

        if (user?.id) {
            await startSession(user);
            return true;
        }
    } catch (error) {
        if (error.status !== 401) {
            console.warn("Session check:", error.message);
        }
    }

    App.user = null;

    if (byId("loginPage")) byId("loginPage").hidden = false;
    if (byId("dashboard")) byId("dashboard").hidden = true;

    return false;
}

async function logout() {
    const button = byId("logoutBtn");

    if (button) button.disabled = true;

    try {
        await apiRequest(API.logout, {
            method: "POST"
        });
    } catch (error) {
        console.warn("Logout request:", error.message);
    }

    App.user = null;
    App.tickets = [];
    App.teamAccounts = [];

    if (byId("dashboard")) byId("dashboard").hidden = true;
    if (byId("loginPage")) byId("loginPage").hidden = false;

    showAuthForm("loginForm");

    if (byId("loginPassword")) {
        byId("loginPassword").value = "";
    }

    if (button) button.disabled = false;

    navigate("home");
}

/* ================= LOGIN FORM ================= */

async function handleLogin(event) {
    event.preventDefault();

    const email = byId("loginEmail").value.trim();
    const password = byId("loginPassword").value;
    const button = $("#loginForm button[type='submit']");

    showMessage("loginMessage", "Signing in...", "info");
    setButtonLoading(button, true, "Signing in...");

    try {
        await login(email, password);
        showMessage("loginMessage", "", "info");
    } catch (error) {
        showMessage("loginMessage", error.message, "error");
    } finally {
        setButtonLoading(button, false);
    }
}

/* ================= SIGNUP FORM ================= */

async function handleSignup(event) {
    event.preventDefault();

    const username = byId("signupUsername").value.trim();
    const email = byId("signupEmail").value.trim();
    const password = byId("signupPassword").value;
    const button = $("#signupForm button[type='submit']");

    if (password.length < 12) {
        showMessage(
            "signupMessage",
            "Password must contain at least 12 characters.",
            "error"
        );
        return;
    }

    showMessage("signupMessage", "Sending verification email...", "info");
    setButtonLoading(button, true, "Sending...");

    try {
        const result = await apiRequest(API.sendVerification, {
            method: "POST",
            body: { username, email, password }
        });

        App.pendingSignupEmail = email;

        showMessage(
            "verifyMessage",
            result.message || `Verification code sent to ${email}.`,
            "success"
        );

        showAuthForm("verifyForm");
    } catch (error) {
        showMessage("signupMessage", error.message, "error");
    } finally {
        setButtonLoading(button, false);
    }
}

/* ================= EMAIL VERIFICATION ================= */

async function handleVerification(event) {
    event.preventDefault();

    const code = byId("verificationCode").value.trim();
    const email = App.pendingSignupEmail;
    const button = $("#verifyForm button[type='submit']");

    if (!email) {
        showMessage(
            "verifyMessage",
            "Signup session missing. Please create your account again.",
            "error"
        );
        return;
    }

    if (!/^\d{6}$/.test(code)) {
        showMessage(
            "verifyMessage",
            "Enter the six-digit verification code.",
            "error"
        );
        return;
    }

    showMessage("verifyMessage", "Verifying email...", "info");
    setButtonLoading(button, true, "Verifying...");

    try {
        await apiRequest(API.verifySignup, {
            method: "POST",
            body: { email, code }
        });

        App.pendingSignupEmail = "";

        showAuthForm("loginForm");

        setText("loginEmail", email);

        showMessage(
            "loginMessage",
            "Email verified! You can now sign in.",
            "success"
        );
    } catch (error) {
        showMessage("verifyMessage", error.message, "error");
    } finally {
        setButtonLoading(button, false);
    }
}

/* ================= NAVIGATION ================= */

function navigate(page) {
    const target = byId(`page-${page}`);

    if (!target) {
        console.warn("Page not found:", page);
        return;
    }

    if (!canAccessPage(target)) {
        showMessage(
            "loginMessage",
            "You do not have permission to access that page.",
            "error"
        );
        return;
    }

    App.currentPage = page;

    $$(".page").forEach(section => {
        section.classList.toggle(
            "active",
            section.id === `page-${page}`
        );
    });

    $$(".nav-link[data-page]").forEach(link => {
        link.classList.toggle(
            "active",
            link.dataset.page === page
        );
    });

    setText("pageTitle", PAGE_TITLES[page] || "ASTRIX CLOUD");

    closeSidebar();

    if (page === "tickets") loadMyTickets();
    if (page === "admin" && isOwner()) loadOwnerStats();
    if (page === "team-management" && isOwner()) loadTeamAccounts();
    if (page === "manage-tickets" && isStaff()) loadAdminTickets();

    window.scrollTo({ top: 0, behavior: "smooth" });
    refreshIcons();
}

function canAccessPage(element) {
    const allowed = element.dataset.allowedRoles;

    if (!allowed) return true;

    const roles = allowed.split(",").map(role => role.trim());
    const userRole = String(App.user?.role || "").toLowerCase();

    return roles.includes(userRole);
}

function applyRolePermissions() {
    $$("[data-allowed-roles]").forEach(element => {
        const allowed = element.dataset.allowedRoles
            .split(",")
            .map(role => role.trim());

        const role = String(App.user?.role || "").toLowerCase();

        element.hidden = !allowed.includes(role);
    });

    const adminNavigation = byId("adminNavigation");

    if (adminNavigation) {
        adminNavigation.hidden = !isStaff();
    }

    const teamLink = $('[data-page="team-management"]');

    if (teamLink) {
        teamLink.hidden = !isOwner();
    }
}

/* ================= SIDEBAR ================= */

function openSidebar() {
    byId("sidebar")?.classList.add("open");
    byId("sidebarOverlay")?.classList.add("active");
}

function closeSidebar() {
    byId("sidebar")?.classList.remove("open");
    byId("sidebarOverlay")?.classList.remove("active");
}

/* ================= USER INTERFACE ================= */

function updateUserInterface() {
    const user = requireUser();

    const name = user.username || user.name || "Cloud User";
    const email = user.email || "";
    const role = String(user.role || "member").toUpperCase();

    setText("sidebarUserName", name);
    setText("sidebarUserRole", role);
    setText("topbarUserName", name);
    setText("homeUserName", name);

    setText("accountName", name);
    setText("accountEmail", email);
    setText("accountRole", role);

    setText("accountNameDetail", name);
    setText("accountEmailDetail", email);
    setText("accountRoleDetail", role);

    setText("ownerName", name);
    setText("ownerEmail", email);

    ["userAvatar", "topbarAvatar", "accountAvatar"].forEach(id => {
        const avatar = byId(id);

        if (!avatar) return;

        avatar.textContent = initials(name);
        avatar.removeAttribute("data-image");
    });

    const savedImage = localStorage.getItem(
        `astrix_avatar_${user.id}`
    );

    if (savedImage) {
        setAvatarImage(savedImage);
    }
}

function setAvatarImage(dataUrl) {
    ["userAvatar", "topbarAvatar", "accountAvatar"].forEach(id => {
        const avatar = byId(id);
        if (!avatar) return;

        avatar.innerHTML = "";

        const image = document.createElement("img");
        image.src = dataUrl;
        image.alt = "Profile image";

        avatar.appendChild(image);
    });
}

/* ================= PROFILE IMAGE ================= */

function handleProfileImage(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        showMessage(
            "logoMessage",
            "Choose a PNG, JPG or WEBP image.",
            "error"
        );
        event.target.value = "";
        return;
    }

    if (file.size > 1024 * 1024) {
        showMessage(
            "logoMessage",
            "Image must be smaller than 1 MB.",
            "error"
        );
        event.target.value = "";
        return;
    }

    const reader = new FileReader();

    reader.onload = () => {
        try {
            const dataUrl = reader.result;

            localStorage.setItem(
                `astrix_avatar_${App.user.id}`,
                dataUrl
            );

            setAvatarImage(dataUrl);

            showMessage(
                "logoMessage",
                "Profile image updated on this device.",
                "success"
            );
        } catch {
            showMessage(
                "logoMessage",
                "Could not save image. Browser storage may be full.",
                "error"
            );
        }
    };

    reader.onerror = () => {
        showMessage("logoMessage", "Could not read image.", "error");
    };

    reader.readAsDataURL(file);
}

/* ================= MY TICKETS ================= */

async function loadMyTickets() {
    if (!App.user) return;

    const container = byId("myTicketsList");
    if (!container) return;

    container.innerHTML = `
        <div class="empty-state">
            <h3>Loading tickets...</h3>
        </div>
    `;

    try {
        const result = await apiRequest(API.tickets);

        App.tickets = normalizeArray(result, "tickets");

        renderTicketList(container, App.tickets, false);
    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>Could not load tickets</h3>
                <p>${escapeHTML(error.message)}</p>
            </div>
        `;
    }
}

function renderTicketList(container, tickets, adminMode) {
    container.replaceChildren();

    if (!tickets.length) {
        const empty = document.createElement("div");
        empty.className = "empty-state";

        const heading = document.createElement("h3");
        heading.textContent = "No tickets found";

        const description = document.createElement("p");
        description.textContent = adminMode
            ? "There are currently no support tickets."
            : "Your support tickets will appear here.";

        empty.append(heading, description);
        container.appendChild(empty);
        return;
    }

    tickets.forEach(ticket => {
        const item = document.createElement("article");
        item.className = "ticket-item content-card";

        const title = document.createElement("h3");
        title.textContent = ticket.subject || `Ticket #${ticket.id}`;

        const category = document.createElement("p");
        category.textContent = ticket.category || "General support";

        const status = document.createElement("span");
        status.className = "role-badge";
        status.textContent = String(ticket.status || "open").toUpperCase();

        const date = document.createElement("small");
        date.textContent = formatDate(ticket.created_at);

        const description = document.createElement("p");
        description.textContent =
            ticket.description || ticket.message || "";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary-button compact-button";
        button.textContent = "View Conversation";

        button.addEventListener("click", () => {
            openTicketConversation(ticket, adminMode);
        });

        item.append(title, category, status, date, description, button);

        if (adminMode && isStaff()) {
            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "text-button";
            toggle.textContent =
                String(ticket.status).toLowerCase() === "closed"
                    ? "Reopen ticket"
                    : "Close ticket";

            toggle.addEventListener("click", () => {
                changeTicketStatus(ticket);
            });

            item.appendChild(toggle);
        }

        container.appendChild(item);
    });
}

/* ================= CREATE TICKET ================= */

async function handleTicketSubmit(event) {
    event.preventDefault();

    const subject = byId("ticketSubject").value.trim();
    const category = byId("ticketCategory").value;
    const message = byId("ticketDescription").value.trim();

    const button = $("#ticketForm button[type='submit']");

    if (!subject || !category || !message) {
        showMessage(
            "ticketFormMessage",
            "Complete all ticket fields.",
            "error"
        );
        return;
    }

    setButtonLoading(button, true, "Submitting...");
    showMessage("ticketFormMessage", "Creating your ticket...", "info");

    try {
        const result = await apiRequest(API.tickets, {
            method: "POST",
            body: { subject, category, message }
        });

        byId("ticketForm").reset();

        showMessage(
            "ticketFormMessage",
            result.message || "Ticket submitted successfully.",
            "success"
        );

        await loadMyTickets();
    } catch (error) {
        showMessage("ticketFormMessage", error.message, "error");
    } finally {
        setButtonLoading(button, false);
    }
}

/* ================= TICKET CONVERSATION ================= */

async function openTicketConversation(ticket, adminMode) {
    const ticketId = ticket.id;

    if (!ticketId) return;

    let replies = [];

    try {
        const result = await apiRequest(
            `${API.ticketReplies}?ticket_id=${encodeURIComponent(ticketId)}`
        );

        replies = normalizeArray(result, "replies");
    } catch (error) {
        alert(`Could not load conversation: ${error.message}`);
        return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "content-card ticket-conversation";

    const heading = document.createElement("h2");
    heading.textContent = ticket.subject || `Ticket #${ticketId}`;

    const close = document.createElement("button");
    close.type = "button";
    close.className = "secondary-button compact-button";
    close.textContent = "Close";

    close.addEventListener("click", () => wrapper.remove());

    const messages = document.createElement("div");
    messages.className = "ticket-messages";

    replies.forEach(reply => {
        const article = document.createElement("article");
        article.className = "ticket-message";

        const author = document.createElement("strong");
        author.textContent =
            `${reply.username || "User"} · ${reply.role || "Member"}`;

        const body = document.createElement("p");
        body.textContent = reply.message || "";

        const time = document.createElement("small");
        time.textContent = formatDate(reply.created_at);

        article.append(author, body, time);
        messages.appendChild(article);
    });

    const form = document.createElement("form");
    form.className = "standard-form";

    const label = document.createElement("label");
    label.textContent = "Write a reply";

    const textarea = document.createElement("textarea");
    textarea.required = true;
    textarea.maxLength = 10000;
    textarea.placeholder = "Type your message...";

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "primary-button";
    submit.textContent = "Send Reply";

    form.append(label, textarea, submit);

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const message = textarea.value.trim();
        if (!message) return;

        submit.disabled = true;

        try {
            await apiRequest(API.ticketReplies, {
                method: "POST",
                body: {
                    ticket_id: ticketId,
                    message
                }
            });

            wrapper.remove();
            await openTicketConversation(ticket, adminMode);
        } catch (error) {
            alert(error.message);
        } finally {
            submit.disabled = false;
        }
    });

    wrapper.append(heading, close, messages, form);

    const page = byId(
        adminMode ? "page-manage-tickets" : "page-tickets"
    );

    page?.appendChild(wrapper);
    wrapper.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ================= TICKET STATUS ================= */

async function changeTicketStatus(ticket) {
    const current = String(ticket.status || "open").toLowerCase();
    const next = current === "closed" ? "open" : "closed";

    if (!confirm(`Are you sure you want to ${next} this ticket?`)) {
        return;
    }

    try {
        await apiRequest(API.ticketStatus, {
            method: "PATCH",
            body: {
                ticket_id: ticket.id,
                status: next
            }
        });

        await loadAdminTickets();
        alert(`Ticket ${next} successfully.`);
    } catch (error) {
        alert(error.message);
    }
}

/* ================= ADMIN TICKETS ================= */

async function loadAdminTickets() {
    if (!isStaff()) return;

    const container = byId("adminTicketsList");
    if (!container) return;

    container.innerHTML = `
        <div class="empty-state">
            <h3>Loading support tickets...</h3>
        </div>
    `;

    try {
        const result = await apiRequest(API.tickets);
        const tickets = normalizeArray(result, "tickets");

        renderTicketList(container, tickets, true);
    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>Could not load tickets</h3>
                <p>${escapeHTML(error.message)}</p>
            </div>
        `;
    }
}

/* ================= OWNER STATISTICS ================= */

async function loadOwnerStats() {
    if (!isOwner()) return;

    setText("ownerStatsStatus", "Loading statistics...");

    try {
        const result = await apiRequest(API.ownerStats);

        const stats = result.stats || result.data?.stats || {};

        $$("[data-owner-stat]").forEach(element => {
            const key = element.dataset.ownerStat;
            const value = stats[key];

            element.textContent =
                value === undefined || value === null
                    ? "—"
                    : Number(value).toLocaleString();
        });

        if (result.owner) {
            setText("ownerName", result.owner.username || "Owner");
            setText("ownerEmail", result.owner.email || "");
        }

        setText("ownerStatsStatus", "Statistics updated");
    } catch (error) {
        setText("ownerStatsStatus", error.message);
    }
}

/* ================= TEAM MANAGEMENT ================= */

async function loadTeamAccounts() {
    if (!isOwner()) return;

    const container = byId("teamAccountsList");
    if (!container) return;

    container.innerHTML = `
        <div class="empty-state">
            <h3>Loading team accounts...</h3>
        </div>
    `;

    try {
        const result = await apiRequest(API.teamUsers);

        App.teamAccounts = normalizeArray(result, "accounts");

        renderTeamAccounts();
    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>Could not load team accounts</h3>
                <p>${escapeHTML(error.message)}</p>
            </div>
        `;
    }
}

function renderTeamAccounts() {
    const container = byId("teamAccountsList");
    if (!container) return;

    container.replaceChildren();

    if (!App.teamAccounts.length) {
        const empty = document.createElement("div");
        empty.className = "empty-state";

        const title = document.createElement("h3");
        title.textContent = "No team accounts found";

        const description = document.createElement("p");
        description.textContent =
            "Create your first team account using the form above.";

        empty.append(title, description);
        container.appendChild(empty);
        return;
    }

    App.teamAccounts.forEach(account => {
        const item = document.createElement("article");
        item.className = "team-account-item";

        const info = document.createElement("div");

        const name = document.createElement("strong");
        name.textContent = account.username || "Team Member";

        const email = document.createElement("p");
        email.textContent = account.email || "";

        const role = document.createElement("span");
        role.className = "role-badge";
        role.textContent = String(account.role || "staff").toUpperCase();

        const date = document.createElement("small");
        date.textContent = formatDate(account.created_at);

        info.append(name, email, role, date);
        item.appendChild(info);

        container.appendChild(item);
    });
}

/* ================= CREATE TEAM ACCOUNT ================= */

async function handleTeamCreate(event) {
    event.preventDefault();

    if (!isOwner()) {
        showMessage(
            "teamCreateMessage",
            "Only the Owner can create team accounts.",
            "error"
        );
        return;
    }

    const username = byId("teamUsername").value.trim();
    const email = byId("teamEmail").value.trim();
    const password = byId("teamPassword").value;
    const role = byId("teamRole").value;

    const button = byId("createTeamAccountBtn");

    if (username.length < 3 || username.length > 30) {
        showMessage(
            "teamCreateMessage",
            "Username must be between 3 and 30 characters.",
            "error"
        );
        return;
    }

    if (password.length < 12 || password.length > 128) {
        showMessage(
            "teamCreateMessage",
            "Password must be between 12 and 128 characters.",
            "error"
        );
        return;
    }

    if (!["admin", "staff", "owner"].includes(role)) {
        showMessage(
            "teamCreateMessage",
            "Invalid team role.",
            "error"
        );
        return;
    }

    setButtonLoading(button, true, "Creating account...");
    showMessage("teamCreateMessage", "Creating team account...", "info");

    try {
        const result = await apiRequest(API.teamUsers, {
            method: "POST",
            body: {
                username,
                email,
                password,
                role
            }
        });

        byId("teamCreateForm").reset();

        showMessage(
            "teamCreateMessage",
            result.message || "Team account created successfully.",
            "success"
        );

        await loadTeamAccounts();
        await loadOwnerStats();
    } catch (error) {
        showMessage("teamCreateMessage", error.message, "error");
    } finally {
        setButtonLoading(button, false);
    }
}

/* ================= PASSWORD VISIBILITY ================= */

function toggleTeamPassword() {
    const input = byId("teamPassword");
    const button = byId("toggleTeamPassword");

    if (!input) return;

    const visible = input.type === "password";
    input.type = visible ? "text" : "password";

    if (button) {
        button.setAttribute(
            "aria-label",
            visible ? "Hide password" : "Show password"
        );

        button.title = visible ? "Hide password" : "Show password";

        button.innerHTML = visible
            ? '<i data-lucide="eye-off"></i>'
            : '<i data-lucide="eye"></i>';

        refreshIcons();
    }
}

/* ================= SERVER CONSOLE ================= */

/*
 * Server controls intentionally do not send requests.
 * A Pterodactyl application API connection must be configured
 * securely on the server before these actions can work.
 */

function showServerNotice(action) {
    const output = byId("consoleOutput");

    if (!output) {
        alert(
            `${action}: Server API connection is not configured.`
        );
        return;
    }

    const line = document.createElement("div");
    line.className = "console-line warning-line";
    line.textContent =
        `[ASTRIX CLOUD] ${action}: Server API connection is not configured.`;

    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
}

function handleServerAction(action) {
    const labels = {
        start: "Start server",
        restart: "Restart server",
        stop: "Stop server"
    };

    showServerNotice(labels[action] || "Server action");
}

function handleConsoleCommand(event) {
    event.preventDefault();

    const input = byId("consoleCommand");
    if (!input || !input.value.trim()) return;

    showServerNotice(
        `Console command not sent: ${input.value.trim()}`
    );

    input.value = "";
}

/* ================= ICONS ================= */

function refreshIcons() {
    if (window.lucide?.createIcons) {
        window.lucide.createIcons();
    }
}

/* ================= EVENT LISTENERS ================= */

function bindEvents() {
    byId("loginForm")?.addEventListener("submit", handleLogin);
    byId("signupForm")?.addEventListener("submit", handleSignup);
    byId("verifyForm")?.addEventListener("submit", handleVerification);

    byId("showSignupBtn")?.addEventListener("click", () => {
        showAuthForm("signupForm");
    });

    byId("showLoginBtn")?.addEventListener("click", () => {
        showAuthForm("loginForm");
    });

    byId("backToLoginBtn")?.addEventListener("click", () => {
        App.pendingSignupEmail = "";
        showAuthForm("loginForm");
    });

    byId("logoutBtn")?.addEventListener("click", logout);

    byId("menuToggle")?.addEventListener("click", openSidebar);
    byId("closeSidebar")?.addEventListener("click", closeSidebar);
    byId("sidebarOverlay")?.addEventListener("click", closeSidebar);

    document.addEventListener("click", event => {
        const target = event.target.closest("[data-page]");
        if (!target) return;

        const page = target.dataset.page;
        if (!page) return;

        event.preventDefault();
        navigate(page);
    });

    byId("ticketForm")?.addEventListener(
        "submit",
        handleTicketSubmit
    );

    byId("teamCreateForm")?.addEventListener(
        "submit",
        handleTeamCreate
    );

    byId("toggleTeamPassword")?.addEventListener(
        "click",
        toggleTeamPassword
    );

    byId("accountLogoInput")?.addEventListener(
        "change",
        handleProfileImage
    );

    byId("refreshOwnerStats")?.addEventListener(
        "click",
        loadOwnerStats
    );

    byId("startServerBtn")?.addEventListener(
        "click",
        () => handleServerAction("start")
    );

    byId("restartServerBtn")?.addEventListener(
        "click",
        () => handleServerAction("restart")
    );

    byId("stopServerBtn")?.addEventListener(
        "click",
        () => handleServerAction("stop")
    );

    byId("consoleCommandForm")?.addEventListener(
        "submit",
        handleConsoleCommand
    );

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeSidebar();
    });
}

/* ================= INITIALIZATION ================= */

async function initializePanel() {
    bindEvents();
    refreshIcons();

    const authenticated = await checkSession();

    if (!authenticated) {
        showAuthForm("loginForm");
    }

    refreshIcons();
}

document.addEventListener("DOMContentLoaded", initializePanel);
