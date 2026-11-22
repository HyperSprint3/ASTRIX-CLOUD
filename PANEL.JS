
/* =========================================================
   ASTRIX CLOUD — CONTROL PANEL
   Graphite Black • Electric Blue • Neon Cyan
   ========================================================= */

"use strict";

/* -------------------- CONFIGURATION -------------------- */

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

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) =>
    [...parent.querySelectorAll(selector)];

let currentUser = null;
let currentPage = "overview";
let cachedTickets = [];

/* -------------------- API REQUESTS -------------------- */

async function apiRequest(url, options = {}) {
    const config = {
        method: options.method || "GET",
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    };

    if (options.body !== undefined) {
        config.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, config);

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

    return data;
}

function getUserId() {
    return currentUser?.id ||
        currentUser?.user_id ||
        currentUser?.email ||
        "default";
}

/* -------------------- SAFE HTML -------------------- */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function showMessage(element, message, success = false) {
    if (!element) return;

    element.textContent = message;
    element.style.color = success ? "#36d399" : "#ff6b78";
    element.style.display = "block";
}

function hideMessage(element) {
    if (!element) return;

    element.textContent = "";
    element.style.display = "none";
}

function setButtonLoading(button, loading, loadingText = "Please wait...") {
    if (!button) return;

    if (loading) {
        button.dataset.originalText = button.textContent;
        button.disabled = true;
        button.textContent = loadingText;
    } else {
        button.disabled = false;

        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }
}

/* -------------------- AUTHENTICATION SCREENS -------------------- */

function showAuthScreen(screen) {
    const screens = {
        login: $("#loginForm"),
        signup: $("#signupForm"),
        verify: $("#verifyForm")
    };

    Object.values(screens).forEach(form => {
        if (form) form.style.display = "none";
    });

    if (screens[screen]) {
        screens[screen].style.display = "";
    }

    [
        $("#loginMessage"),
        $("#signupMessage"),
        $("#verifyMessage")
    ].forEach(hideMessage);
}

$("#showSignupBtn")?.addEventListener("click", () => {
    showAuthScreen("signup");
});

$("#showLoginBtn")?.addEventListener("click", () => {
    showAuthScreen("login");
});

/* Handle the verification screen's separate back button.
   This also prevents the old inline self-click handler. */

const verifyBackButton = $("#verifyForm .auth-switch button");

if (verifyBackButton) {
    verifyBackButton.onclick = null;

    verifyBackButton.addEventListener("click", () => {
        showAuthScreen("login");
    });
}

/* -------------------- LOGIN -------------------- */

$("#loginForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const button = $('button[type="submit"]', form);
    const message = $("#loginMessage");

    hideMessage(message);
    setButtonLoading(button, true, "Signing in...");

    const email = $("#loginEmail")?.value.trim().toLowerCase();
    const password = $("#loginPassword")?.value;

    try {
        const result = await apiRequest(API.login, {
            method: "POST",
            body: { email, password }
        });

        currentUser = result.user || result;

        await openDashboard();
    } catch (error) {
        showMessage(message, error.message || "Login failed.");
    } finally {
        setButtonLoading(button, false);
    }
});

/* -------------------- SIGNUP -------------------- */

$("#signupForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const button = $('button[type="submit"]', form);
    const message = $("#signupMessage");

    hideMessage(message);

    const username = $("#signupUsername")?.value.trim();
    const email = $("#signupEmail")?.value.trim().toLowerCase();
    const password = $("#signupPassword")?.value;

    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username || "")) {
        showMessage(
            message,
            "Username must be 3–30 characters and use only letters, numbers, or underscores."
        );
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "")) {
        showMessage(message, "Enter a valid email address.");
        return;
    }

    if (!password || password.length < 12 || password.length > 128) {
        showMessage(message, "Password must be between 12 and 128 characters.");
        return;
    }

    setButtonLoading(button, true, "Sending verification...");

    try {
        await apiRequest(API.sendVerification, {
            method: "POST",
            body: { username, email, password }
        });

        const emailField = $("#verificationCode");

        if (emailField) {
            emailField.value = "";
            emailField.focus();
        }

        const verifyForm = $("#verifyForm");

        if (verifyForm) {
            verifyForm.dataset.email = email;
        }

        showAuthScreen("verify");

        showMessage(
            $("#verifyMessage"),
            "Verification code requested. Check your email.",
            true
        );
    } catch (error) {
        showMessage(message, error.message || "Could not send verification code.");
    } finally {
        setButtonLoading(button, false);
    }
});

/* -------------------- VERIFY SIGNUP -------------------- */

$("#verifyForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const button = $('button[type="submit"]', form);
    const message = $("#verifyMessage");

    hideMessage(message);

    const email = form.dataset.email;
    const code = $("#verificationCode")?.value.trim();

    if (!email) {
        showMessage(message, "Please start signup again.");
        return;
    }

    if (!/^\d{6}$/.test(code || "")) {
        showMessage(message, "Enter the 6-digit verification code.");
        return;
    }

    setButtonLoading(button, true, "Verifying...");

    try {
        await apiRequest(API.verifySignup, {
            method: "POST",
            body: { email, code }
        });

        showMessage(
            message,
            "Email verified! You can now log in.",
            true
        );

        form.dataset.email = "";

        setTimeout(() => {
            showAuthScreen("login");

            if ($("#loginEmail")) {
                $("#loginEmail").value = email;
            }
        }, 1200);

    } catch (error) {
        showMessage(message, error.message || "Verification failed.");
    } finally {
        setButtonLoading(button, false);
    }
});

/* -------------------- DASHBOARD -------------------- */

function setTextForAll(id, value) {
    $$(`[id="${id}"]`).forEach(element => {
        element.textContent = value ?? "";
    });
}

function getInitials(name) {
    return String(name || "AC")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase() || "")
        .join("");
}

function updateAvatar() {
    if (!currentUser) return;

    const savedLogo = localStorage.getItem(
        `astrix_profile_logo_${getUserId()}`
    );

    const avatarElements = [
        $("#userAvatar"),
        $("#topbarAvatar"),
        $("#accountAvatar")
    ].filter(Boolean);

    avatarElements.forEach(element => {
        if (savedLogo) {
            element.innerHTML = "";
            element.style.backgroundImage = `url("${savedLogo}")`;
            element.style.backgroundSize = "cover";
            element.style.backgroundPosition = "center";
            element.textContent = "";
        } else {
            element.style.backgroundImage = "";
            element.textContent = getInitials(
                currentUser.username || currentUser.name || currentUser.email
            );
        }
    });
}

function updateProfile() {
    if (!currentUser) return;

    const username = currentUser.username ||
        currentUser.name ||
        "ASTRIX User";

    const email = currentUser.email || "Not available";
    const role = currentUser.role || "user";

    setTextForAll("sidebarUserName", username);
    setTextForAll("topbarUserName", username);
    setTextForAll("welcomeName", username);

    setTextForAll("accountName", username);
    setTextForAll("accountNameDetail", username);

    setTextForAll("accountEmail", email);
    setTextForAll("accountEmailDetail", email);

    setTextForAll("accountRole", role);
    setTextForAll("accountRoleDetail", role);

    setTextForAll("sidebarUserRole", role);

    updateAvatar();
}

function isAdmin() {
    return ["owner", "admin", "staff"].includes(
        String(currentUser?.role || "").toLowerCase()
    );
}

function showDashboard() {
    if ($("#loginPage")) $("#loginPage").style.display = "none";
    if ($("#dashboard")) $("#dashboard").style.display = "";

    if ($("#adminNavigation")) {
        $("#adminNavigation").style.display = isAdmin() ? "" : "none";
    }

    updateProfile();
    navigateTo("overview");
}

async function openDashboard() {
    showDashboard();

    await loadTickets();
    updateTicketStats();
}

async function restoreSession() {
    try {
        const result = await apiRequest(API.me);

        currentUser = result.user || result;

        if (!currentUser || !currentUser.email) {
            throw new Error("No active session.");
        }

        await openDashboard();

    } catch {
        currentUser = null;

        if ($("#dashboard")) $("#dashboard").style.display = "none";
        if ($("#loginPage")) $("#loginPage").style.display = "";
        
        showAuthScreen("login");
    }
}

/* -------------------- PAGE NAVIGATION -------------------- */

const pageTitles = {
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
    if (!pageTitles[page]) return;

    const adminPages = [
        "create-server",
        "all-servers",
        "manage-users",
        "manage-tickets"
    ];

    if (adminPages.includes(page) && !isAdmin()) {
        page = "overview";
    }

    currentPage = page;

    $$(".page").forEach(element => {
        element.classList.remove("active");
    });

    const selectedPage = $(`#page-${page}`);

    if (selectedPage) {
        selectedPage.classList.add("active");
    }

    $$("[data-page]").forEach(link => {
        link.classList.toggle(
            "active",
            link.dataset.page === page
        );
    });

    if ($("#pageTitle")) {
        $("#pageTitle").textContent = pageTitles[page];
    }

    closeSidebar();

    if (page === "tickets" || page === "manage-tickets") {
        loadTickets();
    }

    if (page === "account") {
        updateProfile();
    }
}

document.addEventListener("click", event => {
    const link = event.target.closest("[data-page]");

    if (!link) return;

    event.preventDefault();
    navigateTo(link.dataset.page);
});

/* -------------------- MOBILE SIDEBAR -------------------- */

function openSidebar() {
    $("#sidebar")?.classList.add("open");
    $("#sidebarOverlay")?.classList.add("active");
}

function closeSidebar() {
    $("#sidebar")?.classList.remove("open");
    $("#sidebarOverlay")?.classList.remove("active");
}

$("#menuToggle")?.addEventListener("click", openSidebar);
$("#sidebarOverlay")?.addEventListener("click", closeSidebar);

/* -------------------- LOGOUT -------------------- */

$("#logoutBtn")?.addEventListener("click", async () => {
    const button = $("#logoutBtn");

    setButtonLoading(button, true, "Signing out...");

    try {
        await apiRequest(API.logout, {
            method: "POST",
            body: {}
        });
    } catch (error) {
        console.warn("Logout request:", error.message);
    }

    currentUser = null;
    cachedTickets = [];

    if ($("#dashboard")) $("#dashboard").style.display = "none";
    if ($("#loginPage")) $("#loginPage").style.display = "";

    showAuthScreen("login");

    setButtonLoading(button, false);
});

/* -------------------- PROFILE LOGO -------------------- */

$("#accountLogoInput")?.addEventListener("change", event => {
    const file = event.target.files?.[0];
    const message = $("#logoMessage");

    hideMessage(message);

    if (!file) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        showMessage(message, "Use a PNG, JPG, or WEBP image.");
        event.target.value = "";
        return;
    }

    if (file.size > 1024 * 1024) {
        showMessage(message, "Image must be smaller than 1 MB.");
        event.target.value = "";
        return;
    }

    const reader = new FileReader();

    reader.onload = () => {
        try {
            localStorage.setItem(
                `astrix_profile_logo_${getUserId()}`,
                reader.result
            );

            updateAvatar();

            showMessage(message, "Profile logo updated!", true);
        } catch {
            showMessage(message, "Could not save this image. Try a smaller file.");
        }
    };

    reader.onerror = () => {
        showMessage(message, "Could not read this image.");
    };

    reader.readAsDataURL(file);
});

/* -------------------- SERVER PLACEHOLDERS -------------------- */

function showServerPlaceholders() {
    const notice = `
        <div class="empty-state">
            <div class="empty-icon">☁</div>
            <h3>No servers connected</h3>
            <p>ASTRIX CLOUD server provisioning is not connected yet.</p>
        </div>
    `;

    ["myServersList", "myServersPageList", "recentServers",
     "allServersList"].forEach(id => {
        $$(`[id="${id}"]`).forEach(element => {
            element.innerHTML = notice;
        });
    });

    setTextForAll("totalServers", "—");
    setTextForAll("onlineServers", "—");
    setTextForAll("offlineServers", "—");
}

$("#createServerForm")?.addEventListener("submit", event => {
    event.preventDefault();

    showMessage(
        $("#createServerMessage"),
        "Server creation is not connected yet. No server was created."
    );
});

function showUserManagementNotice() {
    if ($("#usersList")) {
        $("#usersList").innerHTML = `
            <div class="empty-state">
                <h3>User management unavailable</h3>
                <p>A user-management API has not been connected yet.</p>
            </div>
        `;
    }
}

/* -------------------- SUPPORT TICKETS -------------------- */

function extractTickets(result) {
    if (Array.isArray(result)) return result;

    return result.tickets ||
        result.data ||
        result.results ||
        [];
}

function ticketStatus(status) {
    return String(status || "open").toLowerCase();
}

function formatDate(value) {
    if (!value) return "Date unavailable";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString();
}

function ticketCard(ticket) {
    const id = ticket.id ?? ticket.ticket_id;
    const subject = escapeHTML(ticket.subject || "Untitled ticket");
    const category = escapeHTML(ticket.category || "General");
    const status = ticketStatus(ticket.status);
    const description = escapeHTML(ticket.description || "");
    const date = formatDate(
        ticket.created_at || ticket.createdAt || ticket.date
    );

    const statusColor = status === "closed"
        ? "#ff7373"
        : status === "resolved"
            ? "#36d399"
            : "#4da3ff";

    const owner = escapeHTML(
        ticket.username ||
        ticket.user_name ||
        ticket.email ||
        ""
    );

    return `
        <article class="ticket-entry" data-ticket-id="${escapeHTML(id)}">
            <div class="ticket-header">
                <div>
                    <h3>${subject}</h3>
                    <p>${category} · ${date}</p>
                    ${owner ? `<p>Submitted by: ${owner}</p>` : ""}
                </div>
                <span style="color:${statusColor};font-weight:700;text-transform:capitalize">
                    ${escapeHTML(status)}
                </span>
            </div>

            <p>${description}</p>

            <button type="button"
                class="secondary-button"
                data-load-replies="${escapeHTML(id)}">
                View conversation
            </button>

            ${isAdmin() ? `
                <select data-ticket-status="${escapeHTML(id)}">
                    <option value="open" ${status === "open" ? "selected" : ""}>Open</option>
                    <option value="in_progress" ${status === "in_progress" ? "selected" : ""}>In Progress</option>
                    <option value="resolved" ${status === "resolved" ? "selected" : ""}>Resolved</option>
                    <option value="closed" ${status === "closed" ? "selected" : ""}>Closed</option>
                </select>
            ` : ""}

            <div class="ticket-replies" id="replies-${escapeHTML(id)}"
                style="display:none"></div>

            <form class="ticket-reply-form" data-ticket-id="${escapeHTML(id)}">
                <textarea name="message" placeholder="Write a reply..." required></textarea>
                <button type="submit">Send Reply</button>
            </form>
        </article>
    `;
}

async function loadTickets() {
    const containers = [
        $("#myTicketsList"),
        $("#adminTicketsList")
    ].filter(Boolean);

    if (!containers.length) return;

    containers.forEach(container => {
        container.innerHTML = `
            <div class="empty-state">
                <p>Loading support tickets...</p>
            </div>
        `;
    });

    try {
        const result = await apiRequest(API.tickets);

        cachedTickets = extractTickets(result);

        const myTickets = cachedTickets.filter(ticket => {
            if (isAdmin()) return true;

            const ticketUserId =
                ticket.user_id ??
                ticket.userId ??
                ticket.owner_id;

            return String(ticketUserId) === String(getUserId()) ||
                String(ticket.email || "").toLowerCase() ===
                String(currentUser?.email || "").toLowerCase();
        });

        if ($("#myTicketsList")) {
            $("#myTicketsList").innerHTML = myTickets.length
                ? myTickets.map(ticketCard).join("")
                : `<div class="empty-state">
                    <h3>No support tickets yet</h3>
                    <p>Create a ticket if you need help.</p>
                   </div>`;
        }

        if ($("#adminTicketsList")) {
            $("#adminTicketsList").innerHTML = isAdmin()
                ? cachedTickets.length
                    ? cachedTickets.map(ticketCard).join("")
                    : `<div class="empty-state"><p>No tickets found.</p></div>`
                : "";
        }

        updateTicketStats();

    } catch (error) {
        containers.forEach(container => {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>Could not load tickets</h3>
                    <p>${escapeHTML(error.message)}</p>
                </div>
            `;
        });
    }
}

function updateTicketStats() {
    const tickets = cachedTickets.filter(ticket => {
        if (isAdmin()) return true;

        const ticketUserId =
            ticket.user_id ??
            ticket.userId ??
            ticket.owner_id;

        return String(ticketUserId) === String(getUserId()) ||
            String(ticket.email || "").toLowerCase() ===
            String(currentUser?.email || "").toLowerCase();
    });

    setTextForAll("totalTickets", String(tickets.length));
}

$("#ticketForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const button = $('button[type="submit"]', form);

    const subject = $("#ticketSubject")?.value.trim();
    const category = $("#ticketCategory")?.value;
    const description = $("#ticketDescription")?.value.trim();

    if (!subject || !category || !description) return;

    setButtonLoading(button, true, "Creating ticket...");

    try {
        await apiRequest(API.tickets, {
            method: "POST",
            body: { subject, category, description }
        });

        form.reset();

        await loadTickets();

        showMessage(
            $("#ticketFormMessage"),
            "Your support ticket was submitted.",
            true
        );

    } catch (error) {
        showMessage(
            $("#ticketFormMessage"),
            error.message || "Could not create ticket."
        );
    } finally {
        setButtonLoading(button, false);
    }
});

/* Ticket conversation and status actions */

document.addEventListener("click", async event => {
    const button = event.target.closest("[data-load-replies]");

    if (!button) return;

    const ticketId = button.dataset.loadReplies;
    const container = $(`#replies-${CSS.escape(ticketId)}`);

    if (!container) return;

    if (container.style.display === "block") {
        container.style.display = "none";
        return;
    }

    container.style.display = "block";
    container.innerHTML = "<p>Loading conversation...</p>";

    try {
        const result = await apiRequest(
            `${API.ticketReplies}?ticket_id=${encodeURIComponent(ticketId)}`
        );

        const replies = Array.isArray(result)
            ? result
            : result.replies || result.data || [];

        container.innerHTML = replies.length
            ? replies.map(reply => `
                <div class="ticket-reply">
                    <strong>${escapeHTML(reply.username || reply.name || "User")}</strong>
                    <p>${escapeHTML(reply.message || "")}</p>
                    <small>${escapeHTML(formatDate(reply.created_at))}</small>
                </div>
            `).join("")
            : "<p>No replies yet.</p>";

    } catch (error) {
        container.textContent = error.message || "Could not load replies.";
    }
});

document.addEventListener("submit", async event => {
    const form = event.target.closest(".ticket-reply-form");

    if (!form) return;

    event.preventDefault();

    const ticketId = form.dataset.ticketId;
    const message = form.querySelector('[name="message"]')?.value.trim();
    const button = $('button[type="submit"]', form);

    if (!message) return;

    setButtonLoading(button, true, "Sending...");

    try {
        await apiRequest(API.ticketReplies, {
            method: "POST",
            body: {
                ticket_id: ticketId,
                message
            }
        });

        form.reset();

        const container = $(`#replies-${CSS.escape(ticketId)}`);

        if (container) {
            container.style.display = "block";

            const result = await apiRequest(
                `${API.ticketReplies}?ticket_id=${encodeURIComponent(ticketId)}`
            );

            const replies = Array.isArray(result)
                ? result
                : result.replies || result.data || [];

            container.innerHTML = replies.map(reply => `
                <div class="ticket-reply">
                    <strong>${escapeHTML(reply.username || reply.name || "User")}</strong>
                    <p>${escapeHTML(reply.message || "")}</p>
                    <small>${escapeHTML(formatDate(reply.created_at))}</small>
                </div>
            `).join("");
        }

    } catch (error) {
        alert(error.message || "Could not send reply.");
    } finally {
        setButtonLoading(button, false);
    }
});

document.addEventListener("change", async event => {
    const select = event.target.closest("[data-ticket-status]");

    if (!select) return;

    const ticketId = select.dataset.ticketStatus;
    const status = select.value;

    select.disabled = true;

    try {
        await apiRequest(API.ticketStatus, {
            method: "PATCH",
            body: {
                ticket_id: ticketId,
                status
            }
        });

        await loadTickets();

    } catch (error) {
        alert(error.message || "Could not update ticket status.");
        await loadTickets();
    } finally {
        select.disabled = false;
    }
});

/* -------------------- STARTUP -------------------- */

document.addEventListener("DOMContentLoaded", async () => {
    showServerPlaceholders();
    showUserManagementNotice();

    if ($("#loginPage")) {
        $("#loginPage").style.display = "";
    }

    if ($("#dashboard")) {
        $("#dashboard").style.display = "none";
    }

    await restoreSession();
});
