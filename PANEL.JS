
/* =========================================================
   ASTRIX CLOUD — CONTROL PANEL
   Modern Cloud Dashboard
   Deep Navy-Slate + Electric Indigo
   ========================================================= */

"use strict";

/* ================= CONFIGURATION ================= */

const API = {
    login: "/api/login",
    logout: "/api/logout",
    me: "/api/me",
    sendVerification: "/api/send-verification",
    verifySignup: "/api/verify-signup",
    tickets: "/api/tickets",
    ticketReplies: "/api/ticket-replies",
    ticketStatus: "/api/ticket-status"
};

const $ = selector => document.querySelector(selector);

let currentUser = null;
let currentPage = "overview";
let cachedServers = [];
let cachedTickets = [];

/* ================= HELPERS ================= */

function getUserId(user = currentUser) {
    return user?.id || user?.user_id || user?.email || "guest";
}

function getInitials(name = "A") {
    return String(name)
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase() || "")
        .join("") || "A";
}

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function showMessage(element, message, type = "error") {
    if (!element) return;

    element.textContent = message;
    element.className = message ? `message ${type}` : "message";
    element.hidden = !message;
}

function setButtonLoading(button, loading, text = "Please wait...") {
    if (!button) return;

    if (loading) {
        button.dataset.originalText = button.innerHTML;
        button.disabled = true;
        button.textContent = text;
    } else {
        button.disabled = false;

        if (button.dataset.originalText) {
            button.innerHTML = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    let data = {};

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        throw new Error(
            data.error ||
            data.message ||
            `Request failed (${response.status})`
        );
    }

    if (data.success === false) {
        throw new Error(data.error || data.message || "Request failed");
    }

    return data;
}

function getArray(result, key) {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.[key])) return result[key];
    if (Array.isArray(result?.data)) return result.data;
    return [];
}

/* ================= AUTH SCREENS ================= */

function showAuthScreen(screen) {
    const screens = [
        "#loginForm",
        "#signupForm",
        "#verifyForm"
    ];

    screens.forEach(selector => {
        const element = $(selector);
        if (element) element.hidden = true;
    });

    const selected = $(
        screen === "signup"
            ? "#signupForm"
            : screen === "verify"
                ? "#verifyForm"
                : "#loginForm"
    );

    if (selected) selected.hidden = false;

    [
        "#loginMessage",
        "#signupMessage",
        "#verifyMessage"
    ].forEach(selector => showMessage($(selector), ""));
}

function showLogin() {
    showAuthScreen("login");
}

function showSignup() {
    showAuthScreen("signup");
}

function showVerification() {
    showAuthScreen("verify");
}

/* ================= LOGIN ================= */

async function handleLogin(event) {
    event.preventDefault();

    const button = $("#loginForm button[type='submit']");
    const message = $("#loginMessage");

    const email = $("#loginEmail")?.value.trim();
    const password = $("#loginPassword")?.value;

    if (!email || !password) {
        return showMessage(message, "Please enter your email and password.");
    }

    setButtonLoading(button, true);

    try {
        const result = await apiRequest(API.login, {
            method: "POST",
            body: JSON.stringify({ email, password })
        });

        const user = result.user || result.data?.user || result.data;

        if (!user || typeof user !== "object") {
            throw new Error("Login succeeded but user information was not returned.");
        }

        currentUser = user;
        showDashboard(currentUser);

    } catch (error) {
        showMessage(message, error.message);
    } finally {
        setButtonLoading(button, false);
    }
}

/* ================= SIGNUP ================= */

async function handleSignup(event) {
    event.preventDefault();

    const button = $("#signupForm button[type='submit']");
    const message = $("#signupMessage");

    const username = $("#signupUsername")?.value.trim();
    const email = $("#signupEmail")?.value.trim();
    const password = $("#signupPassword")?.value;

    if (!username || !email || !password) {
        return showMessage(message, "Please complete all fields.");
    }

    if (password.length < 8) {
        return showMessage(message, "Password must be at least 8 characters.");
    }

    setButtonLoading(button, true);

    try {
        await apiRequest(API.sendVerification, {
            method: "POST",
            body: JSON.stringify({
                username,
                email,
                password
            })
        });

        const emailInput = $("#verifyForm input[name='email']");
        if (emailInput) emailInput.value = email;

        const verifyForm = $("#verifyForm");
        if (verifyForm) verifyForm.dataset.email = email;

        showVerification();

        showMessage(
            $("#verifyMessage"),
            "Verification code sent. Check your email.",
            "success"
        );

    } catch (error) {
        showMessage(message, error.message);
    } finally {
        setButtonLoading(button, false);
    }
}

/* ================= EMAIL VERIFICATION ================= */

async function handleVerification(event) {
    event.preventDefault();

    const button = $("#verifyForm button[type='submit']");
    const message = $("#verifyMessage");

    const email =
        $("#verifyForm")?.dataset.email ||
        $("#verifyEmail")?.value.trim();

    const code = $("#verificationCode")?.value.trim();

    if (!email || !code) {
        return showMessage(message, "Enter your verification code.");
    }

    setButtonLoading(button, true);

    try {
        await apiRequest(API.verifySignup, {
            method: "POST",
            body: JSON.stringify({ email, code })
        });

        showLogin();

        showMessage(
            $("#loginMessage"),
            "Account verified! You can now log in.",
            "success"
        );

        if ($("#loginEmail")) {
            $("#loginEmail").value = email;
        }

    } catch (error) {
        showMessage(message, error.message);
    } finally {
        setButtonLoading(button, false);
    }
}

/* ================= DASHBOARD ================= */

function showDashboard(user) {
    currentUser = user;

    const loginPage = $("#loginPage");
    const dashboard = $("#dashboard");

    if (loginPage) loginPage.hidden = true;
    if (dashboard) dashboard.hidden = false;

    updateProfile();
    setupRoleNavigation();

    navigateTo("overview");
    loadDashboardData();
}

function showAuth() {
    if ($("#dashboard")) $("#dashboard").hidden = true;
    if ($("#loginPage")) $("#loginPage").hidden = false;

    currentUser = null;
    closeSidebar();
}

/* ================= PROFILE ================= */

function updateProfile() {
    if (!currentUser) return;

    const name =
        currentUser.username ||
        currentUser.name ||
        currentUser.email ||
        "ASTRIX User";

    const email = currentUser.email || "No email";
    const role = currentUser.role || "user";
    const initials = getInitials(name);

    const elements = {
        "#sidebarUserName": name,
        "#sidebarUserRole": role,
        "#topbarUserName": name,
        "#accountName": name,
        "#accountEmail": email,
        "#accountRole": role,
        "#accountNameDetail": name,
        "#accountEmailDetail": email,
        "#accountRoleDetail": role,
        "#welcomeName": name
    };

    Object.entries(elements).forEach(([selector, value]) => {
        const element = $(selector);
        if (element) element.textContent = value;
    });

    [
        "#userAvatar",
        "#topbarAvatar",
        "#accountAvatar"
    ].forEach(selector => {
        const element = $(selector);
        if (element) element.textContent = initials;
    });

    loadSavedLogo();
}

/* ================= ROLE NAVIGATION ================= */

function isAdmin() {
    return ["admin", "owner", "staff"].includes(
        String(currentUser?.role || "").toLowerCase()
    );
}

function setupRoleNavigation() {
    const adminNavigation = $("#adminNavigation");

    if (adminNavigation) {
        adminNavigation.hidden = !isAdmin();
    }
}

/* ================= PAGE NAVIGATION ================= */

const PAGE_TITLES = {
    overview: "Overview",
    servers: "My Servers",
    tickets: "Support Tickets",
    account: "My Account",
    "create-server": "Create Server",
    "all-servers": "All Servers",
    "manage-users": "Manage Users",
    "manage-tickets": "Manage Tickets"
};

function navigateTo(page) {
    if (!PAGE_TITLES[page]) return;

    if (
        ["create-server", "all-servers", "manage-users", "manage-tickets"]
            .includes(page) &&
        !isAdmin()
    ) {
        page = "overview";
    }

    currentPage = page;

    document.querySelectorAll("[id^='page-']").forEach(element => {
        element.hidden = element.id !== `page-${page}`;
    });

    document.querySelectorAll("[data-page]").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.page === page
        );
    });

    const title = $("#pageTitle");
    if (title) title.textContent = PAGE_TITLES[page];

    closeSidebar();
}

/* ================= SIDEBAR ================= */

function openSidebar() {
    $("#sidebar")?.classList.add("open");

    if ($("#sidebarOverlay")) {
        $("#sidebarOverlay").hidden = false;
    }
}

function closeSidebar() {
    $("#sidebar")?.classList.remove("open");

    if ($("#sidebarOverlay")) {
        $("#sidebarOverlay").hidden = true;
    }
}

/* ================= DASHBOARD DATA ================= */

async function loadDashboardData() {
    await Promise.allSettled([
        loadServers(),
        loadTickets()
    ]);

    updateDashboardStats();
}

function updateDashboardStats() {
    const total = cachedServers.length;

    const online = cachedServers.filter(server =>
        String(server.status || "").toLowerCase() === "online"
    ).length;

    const offline = total - online;

    if ($("#totalServers")) $("#totalServers").textContent = total;
    if ($("#onlineServers")) $("#onlineServers").textContent = online;
    if ($("#offlineServers")) $("#offlineServers").textContent = offline;
    if ($("#totalTickets")) $("#totalTickets").textContent = cachedTickets.length;
}

/* ================= SERVERS ================= */

async function loadServers() {
    // Server provisioning and server-list API are not connected yet.
    cachedServers = [];
    renderServers();
}

function renderServers() {
    const myServers = $("#myServersList");
    const recentServers = $("#recentServers");
    const allServers = $("#allServersList");

    const empty = `
        <div class="empty-state">
            <div>☁️</div>
            <strong>No servers yet</strong>
            <p>Your cloud servers will appear here when server provisioning is connected.</p>
        </div>
    `;

    if (myServers) myServers.innerHTML = empty;
    if (recentServers) recentServers.innerHTML = empty;
    if (allServers) allServers.innerHTML = empty;
}

/* ================= SUPPORT TICKETS ================= */

async function loadTickets() {
    try {
        const result = await apiRequest(API.tickets);
        cachedTickets = getArray(result, "tickets");

        renderTickets();
        updateDashboardStats();

    } catch (error) {
        console.error("Ticket loading error:", error);
        cachedTickets = [];
        renderTickets();
    }
}

function renderTickets() {
    const myTickets = $("#myTicketsList");
    const adminTickets = $("#adminTicketsList");

    const empty = `
        <div class="empty-state">
            <div>🎫</div>
            <strong>No support tickets</strong>
            <p>Create a support ticket if you need help.</p>
        </div>
    `;

    if (myTickets) {
        myTickets.innerHTML = cachedTickets.length
            ? cachedTickets.map(ticketCard).join("")
            : empty;
    }

    if (adminTickets) {
        adminTickets.innerHTML = cachedTickets.length
            ? cachedTickets.map(ticketCard).join("")
            : empty;
    }
}

function ticketCard(ticket) {
    const id = ticket.id || ticket.ticket_id;
    const subject = escapeHTML(ticket.subject || "Support request");
    const status = String(ticket.status || "open").toLowerCase();

    const badge = status === "closed"
        ? "badge-neutral"
        : status === "resolved"
            ? "badge-success"
            : "badge-warning";

    return `
        <div class="ticket-card">
            <div class="ticket-card-header">
                <h3>${subject}</h3>
                <span class="badge ${badge}">${escapeHTML(status)}</span>
            </div>

            <p class="ticket-description">
                ${escapeHTML(ticket.description || ticket.message || "")}
            </p>

            <div class="list-item-main">
                <span>Ticket #${escapeHTML(id || "N/A")}</span>
            </div>

            <div style="margin-top:14px;display:flex;gap:9px;flex-wrap:wrap">
                <button class="btn btn-secondary" type="button"
                    data-ticket-replies="${escapeHTML(id || "")}">
                    View replies
                </button>

                ${status !== "closed" ? `
                    <button class="btn btn-danger" type="button"
                        data-ticket-close="${escapeHTML(id || "")}">
                        Close ticket
                    </button>
                ` : ""}
            </div>

            <div id="ticket-replies-${escapeHTML(id || "")}" hidden
                style="margin-top:15px"></div>

            <form class="ticket-reply-form" data-ticket-id="${escapeHTML(id || "")}"
                style="margin-top:12px" hidden>
                <textarea class="form-control" name="message"
                    placeholder="Write your reply..." required></textarea>
                <button class="btn btn-primary" type="submit"
                    style="margin-top:9px">Send reply</button>
            </form>
        </div>
    `;
}

async function createTicket(event) {
    event.preventDefault();

    const button = $("#ticketForm button[type='submit']");
    const message = $("#ticketFormMessage");

    const subject = $("#ticketSubject")?.value.trim();
    const category = $("#ticketCategory")?.value;
    const description = $("#ticketDescription")?.value.trim();

    if (!subject || !description) {
        return showMessage(message, "Please complete the ticket details.");
    }

    setButtonLoading(button, true);

    try {
        await apiRequest(API.tickets, {
            method: "POST",
            body: JSON.stringify({
                subject,
                category,
                description
            })
        });

        $("#ticketForm")?.reset();

        showMessage(message, "Ticket created successfully.", "success");

        await loadTickets();

    } catch (error) {
        showMessage(message, error.message);
    } finally {
        setButtonLoading(button, false);
    }
}

async function loadTicketReplies(ticketId) {
    const container = $(`#ticket-replies-${CSS.escape(ticketId)}`);
    const form = document.querySelector(
        `.ticket-reply-form[data-ticket-id="${CSS.escape(ticketId)}"]`
    );

    if (!container) return;

    container.hidden = false;

    try {
        const result = await apiRequest(
            `${API.ticketReplies}?ticket_id=${encodeURIComponent(ticketId)}`
        );

        const replies = getArray(result, "replies");

        container.innerHTML = replies.length
            ? replies.map(reply => `
                <div class="list-item" style="margin-bottom:8px">
                    <div class="list-item-main">
                        <strong>${escapeHTML(reply.username || reply.user_name || "User")}</strong>
                        <span>${escapeHTML(reply.message || "")}</span>
                    </div>
                </div>
            `).join("")
            : `<p class="muted">No replies yet.</p>`;

        if (form) form.hidden = false;

    } catch (error) {
        container.textContent = error.message;
    }
}

async function sendTicketReply(event) {
    event.preventDefault();

    const form = event.target.closest(".ticket-reply-form");
    if (!form) return;

    const ticketId = form.dataset.ticketId;
    const message = form.querySelector("[name='message']")?.value.trim();

    if (!message) return;

    const button = form.querySelector("button[type='submit']");
    setButtonLoading(button, true);

    try {
        await apiRequest(API.ticketReplies, {
            method: "POST",
            body: JSON.stringify({
                ticket_id: ticketId,
                message
            })
        });

        form.reset();
        await loadTicketReplies(ticketId);

    } catch (error) {
        alert(error.message);
    } finally {
        setButtonLoading(button, false);
    }
}

async function closeTicket(ticketId) {
    if (!confirm("Are you sure you want to close this ticket?")) return;

    try {
        await apiRequest(API.ticketStatus, {
            method: "POST",
            body: JSON.stringify({
                ticket_id: ticketId,
                status: "closed"
            })
        });

        await loadTickets();

    } catch (error) {
        alert(error.message);
    }
}

/* ================= ACCOUNT LOGO ================= */

function loadSavedLogo() {
    const logo = localStorage.getItem(
        `astrix_profile_logo_${getUserId()}`
    );

    if (!logo) return;

    [
        "#userAvatar",
        "#topbarAvatar",
        "#accountAvatar"
    ].forEach(selector => {
        const element = $(selector);
        if (!element) return;

        element.innerHTML = `<img src="${logo}" alt="Profile logo">`;
    });
}

function handleLogoUpload(event) {
    const file = event.target.files?.[0];
    const message = $("#logoMessage");

    if (!file) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        return showMessage(message, "Use PNG, JPG, or WEBP images.");
    }

    if (file.size > 1024 * 1024) {
        return showMessage(message, "Image must be smaller than 1 MB.");
    }

    const reader = new FileReader();

    reader.onload = () => {
        try {
            localStorage.setItem(
                `astrix_profile_logo_${getUserId()}`,
                reader.result
            );

            loadSavedLogo();

            showMessage(message, "Profile logo updated.", "success");

        } catch {
            showMessage(message, "Unable to save this image in browser storage.");
        }
    };

    reader.readAsDataURL(file);
}

/* ================= ADMIN PLACEHOLDERS ================= */

async function createServer(event) {
    event.preventDefault();

    showMessage(
        $("#createServerMessage"),
        "Server provisioning is not connected yet. Connect a server provider before creating servers."
    );
}

/* ================= LOGOUT ================= */

async function handleLogout() {
    try {
        await apiRequest(API.logout, {
            method: "POST"
        });
    } catch (error) {
        console.error("Logout error:", error);
    }

    cachedServers = [];
    cachedTickets = [];

    showAuth();
    showLogin();
}

/* ================= EVENT LISTENERS ================= */

function setupEventListeners() {
    $("#loginForm")?.addEventListener("submit", handleLogin);
    $("#signupForm")?.addEventListener("submit", handleSignup);
    $("#verifyForm")?.addEventListener("submit", handleVerification);

    $("#showSignupBtn")?.addEventListener("click", showSignup);
    $("#showLoginBtn")?.addEventListener("click", showLogin);
    $("#backToLoginBtn")?.addEventListener("click", showLogin);

    $("#logoutBtn")?.addEventListener("click", handleLogout);

    $("#menuToggle")?.addEventListener("click", openSidebar);
    $("#closeSidebar")?.addEventListener("click", closeSidebar);
    $("#sidebarOverlay")?.addEventListener("click", closeSidebar);

    $("#ticketForm")?.addEventListener("submit", createTicket);
    $("#createServerForm")?.addEventListener("submit", createServer);

    $("#accountLogoInput")?.addEventListener("change", handleLogoUpload);

    document.addEventListener("click", event => {
        const nav = event.target.closest("[data-page]");

        if (nav) {
            navigateTo(nav.dataset.page);
            return;
        }

        const replies = event.target.closest("[data-ticket-replies]");

        if (replies) {
            loadTicketReplies(replies.dataset.ticketReplies);
            return;
        }

        const close = event.target.closest("[data-ticket-close]");

        if (close) {
            closeTicket(close.dataset.ticketClose);
        }
    });

    document.addEventListener("submit", event => {
        if (event.target.matches(".ticket-reply-form")) {
            sendTicketReply(event);
        }
    });
}

/* ================= SESSION RESTORE ================= */

async function restoreSession() {
    try {
        const result = await apiRequest(API.me);

        const user = result.user || result.data?.user || result.data;

        if (user && typeof user === "object") {
            showDashboard(user);
        } else {
            showAuth();
        }

    } catch {
        showAuth();
        showLogin();
    }
}

/* ================= START ================= */

document.addEventListener("DOMContentLoaded", () => {
    setupEventListeners();
    restoreSession();
});

