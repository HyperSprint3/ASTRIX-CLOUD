
"use strict";

/* ==========================================================
   ASTRIX CLOUD — CONTROL PANEL
   Pterodactyl-inspired interface
   Authentication • Navigation • Account • Support
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
    ticketStatus: "/api/ticket-status"
};

const SELECTORS = {
    loginPage: "#loginPage",
    dashboard: "#dashboard",
    loginForm: "#loginForm",
    signupForm: "#signupForm",
    verifyForm: "#verifyForm"
};

let currentUser = null;
let pendingSignupEmail = "";
let pendingSignupDetails = null;
let isLoadingTickets = false;

/* ================= HELPERS ================= */

const $ = (selector, root = document) => root.querySelector(selector);

const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

function setMessage(selector, message, type = "error") {
    const element = $(selector);
    if (!element) return;

    element.textContent = message || "";
    element.className = "form-message";

    if (message) {
        element.classList.add(type === "success" ? "success-message" : "error-message");
    }
}

function setButtonLoading(button, loading, loadingText = "Please wait...") {
    if (!button) return;

    if (loading) {
        if (!button.dataset.originalText) {
            button.dataset.originalText = button.innerHTML;
        }
        button.disabled = true;
        button.textContent = loadingText;
    } else {
        button.disabled = false;
        if (button.dataset.originalText) {
            button.innerHTML = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }
}

async function apiRequest(url, options = {}) {
    const config = {
        method: options.method || "GET",
        credentials: "same-origin",
        headers: {
            "Accept": "application/json",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {})
    };

    const response = await fetch(url, config);

    const contentType = response.headers.get("content-type") || "";
    let data = {};

    if (contentType.includes("application/json")) {
        data = await response.json();
    } else {
        const text = await response.text();
        data = text ? { message: text } : {};
    }

    if (!response.ok) {
        const message =
            data.message ||
            data.error ||
            `Request failed (${response.status})`;

        throw new Error(message);
    }

    return data;
}

function getUserId(user = currentUser) {
    return user?.id ?? user?.user_id ?? user?.uuid ?? "default";
}

function getUserName(user = currentUser) {
    return (
        user?.username ||
        user?.name ||
        user?.email?.split("@")[0] ||
        "Cloud User"
    );
}

function getUserEmail(user = currentUser) {
    return user?.email || "No email available";
}

function getUserRole(user = currentUser) {
    return String(user?.role || "member").toLowerCase();
}

function isStaff(user = currentUser) {
    return ["owner", "admin", "staff"].includes(getUserRole(user));
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function getInitials(name) {
    return String(name || "AC")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part[0] || "")
        .join("")
        .toUpperCase();
}

function showIcons() {
    if (window.lucide?.createIcons) {
        window.lucide.createIcons();
    }
}

function showLogin() {
    $(SELECTORS.loginPage).hidden = false;
    $(SELECTORS.dashboard).hidden = true;
    closeSidebar();
    showIcons();
}

function showDashboard() {
    $(SELECTORS.loginPage).hidden = true;
    $(SELECTORS.dashboard).hidden = false;
    updateUserInterface();
    navigateTo("overview");
    closeSidebar();
    showIcons();
}

/* ================= AUTH FORM SWITCHING ================= */

function showAuthForm(formName) {
    const forms = {
        login: $(SELECTORS.loginForm),
        signup: $(SELECTORS.signupForm),
        verify: $(SELECTORS.verifyForm)
    };

    Object.entries(forms).forEach(([name, form]) => {
        if (form) form.hidden = name !== formName;
    });

    setMessage("#loginMessage", "");
    setMessage("#signupMessage", "");
    setMessage("#verifyMessage", "");

    showIcons();
}

$("#showSignupBtn")?.addEventListener("click", () => {
    showAuthForm("signup");
});

$("#showLoginBtn")?.addEventListener("click", () => {
    showAuthForm("login");
});

$("#backToLoginBtn")?.addEventListener("click", () => {
    showAuthForm("login");
});

/* ================= LOGIN ================= */

$(SELECTORS.loginForm)?.addEventListener("submit", async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');

    const email = $("#loginEmail")?.value.trim();
    const password = $("#loginPassword")?.value;

    if (!email || !password) {
        setMessage("#loginMessage", "Enter your email and password.");
        return;
    }

    setButtonLoading(button, true, "Signing in...");
    setMessage("#loginMessage", "");

    try {
        const result = await apiRequest(API.login, {
            method: "POST",
            body: { email, password }
        });

        currentUser = result.user || result.data?.user || null;

        if (!currentUser) {
            const me = await apiRequest(API.me);
            currentUser = me.user || me.data?.user || me;
        }

        if (!currentUser || !getUserEmail(currentUser)) {
            throw new Error("Login succeeded but user details could not be loaded.");
        }

        $("#loginPassword").value = "";
        showDashboard();
        await loadTickets();

    } catch (error) {
        setMessage("#loginMessage", error.message || "Unable to sign in.");
    } finally {
        setButtonLoading(button, false);
    }
});

/* ================= SIGNUP ================= */

$(SELECTORS.signupForm)?.addEventListener("submit", async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');

    const username = $("#signupUsername")?.value.trim();
    const email = $("#signupEmail")?.value.trim();
    const password = $("#signupPassword")?.value;

    if (!username || !email || !password) {
        setMessage("#signupMessage", "Complete all fields.");
        return;
    }

    if (username.length < 3 || username.length > 30) {
        setMessage("#signupMessage", "Username must be 3–30 characters.");
        return;
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
        setMessage("#signupMessage", "Username contains unsupported characters.");
        return;
    }

    if (password.length < 12 || password.length > 128) {
        setMessage("#signupMessage", "Password must be 12–128 characters.");
        return;
    }

    setButtonLoading(button, true, "Sending verification...");
    setMessage("#signupMessage", "");

    try {
        await apiRequest(API.sendVerification, {
            method: "POST",
            body: { username, email, password }
        });

        pendingSignupEmail = email;
        pendingSignupDetails = { username, email, password };

        showAuthForm("verify");
        setMessage(
            "#verifyMessage",
            "Verification code sent. Check your email.",
            "success"
        );

    } catch (error) {
        setMessage("#signupMessage", error.message || "Unable to start signup.");
    } finally {
        setButtonLoading(button, false);
    }
});

/* ================= EMAIL VERIFICATION ================= */

$(SELECTORS.verifyForm)?.addEventListener("submit", async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');

    const code = $("#verificationCode")?.value.trim();
    const email = pendingSignupEmail || pendingSignupDetails?.email;

    if (!email) {
        setMessage("#verifyMessage", "Signup session not found. Start again.");
        return;
    }

    if (!/^\d{6}$/.test(code || "")) {
        setMessage("#verifyMessage", "Enter the six-digit verification code.");
        return;
    }

    setButtonLoading(button, true, "Verifying...");
    setMessage("#verifyMessage", "");

    try {
        const result = await apiRequest(API.verifySignup, {
            method: "POST",
            body: { email, code }
        });

        pendingSignupDetails = null;
        pendingSignupEmail = "";
        $("#verificationCode").value = "";

        const returnedUser = result.user || result.data?.user;

        if (returnedUser) {
            currentUser = returnedUser;
            showDashboard();
            await loadTickets();
        } else {
            showAuthForm("login");
            $("#loginEmail").value = email;
            setMessage(
                "#loginMessage",
                "Email verified! You can now sign in.",
                "success"
            );
        }

    } catch (error) {
        setMessage("#verifyMessage", error.message || "Verification failed.");
    } finally {
        setButtonLoading(button, false);
    }
});

/* ================= SESSION RESTORE ================= */

async function restoreSession() {
    try {
        const result = await apiRequest(API.me);

        currentUser = result.user || result.data?.user || result;

        if (!currentUser || !getUserEmail(currentUser)) {
            throw new Error("No active session.");
        }

        showDashboard();
        await loadTickets();

    } catch {
        currentUser = null;
        showLogin();
    }
}

/* ================= USER INTERFACE ================= */

function updateUserInterface() {
    if (!currentUser) return;

    const name = getUserName();
    const email = getUserEmail();
    const role = getUserRole();

    const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
    const initials = getInitials(name);

    $("#sidebarUserName").textContent = name;
    $("#sidebarUserRole").textContent = roleLabel;
    $("#topbarUserName").textContent = name;

    $("#accountName").textContent = name;
    $("#accountEmail").textContent = email;
    $("#accountRole").textContent = roleLabel;

    $("#accountNameDetail").textContent = name;
    $("#accountEmailDetail").textContent = email;
    $("#accountRoleDetail").textContent = roleLabel;

    $("#userAvatar").textContent = initials;
    $("#topbarAvatar").textContent = initials;
    $("#accountAvatar").textContent = initials;

    const adminNavigation = $("#adminNavigation");
    if (adminNavigation) {
        adminNavigation.hidden = !isStaff();
    }

    loadProfileLogo();
}

/* ================= PROFILE LOGO ================= */

function getProfileLogoKey() {
    return `astrix_profile_logo_${getUserId()}`;
}

function loadProfileLogo() {
    if (!currentUser) return;

    let logo = null;

    try {
        logo = localStorage.getItem(getProfileLogoKey());
    } catch (error) {
        console.warn("Profile image storage unavailable.", error);
    }

    const avatars = [
        $("#userAvatar"),
        $("#topbarAvatar"),
        $("#accountAvatar")
    ];

    avatars.forEach(avatar => {
        if (!avatar) return;

        if (logo) {
            avatar.innerHTML = `<img src="${logo}" alt="Profile image">`;
        } else {
            avatar.textContent = getInitials(getUserName());
        }
    });
}

$("#accountLogoInput")?.addEventListener("change", event => {
    const file = event.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
        "image/png",
        "image/jpeg",
        "image/webp"
    ];

    if (!allowedTypes.includes(file.type)) {
        setMessage("#logoMessage", "Choose a PNG, JPG or WEBP image.");
        event.target.value = "";
        return;
    }

    if (file.size > 1024 * 1024) {
        setMessage("#logoMessage", "Image must be smaller than 1 MB.");
        event.target.value = "";
        return;
    }

    const reader = new FileReader();

    reader.onload = () => {
        try {
            localStorage.setItem(getProfileLogoKey(), reader.result);
            loadProfileLogo();
            setMessage("#logoMessage", "Profile image updated.", "success");
        } catch {
            setMessage("#logoMessage", "Unable to save this image in browser storage.");
        }
    };

    reader.onerror = () => {
        setMessage("#logoMessage", "Unable to read this image.");
    };

    reader.readAsDataURL(file);
});

/* ================= NAVIGATION ================= */

const pageNames = {
    overview: "Console",
    files: "Files",
    databases: "Databases",
    schedules: "Schedules",
    users: "Users",
    backups: "Backups",
    network: "Network",
    startup: "Startup",
    settings: "Settings",
    activity: "Activity",
    tickets: "Support Tickets",
    account: "My Account",
    admin: "Admin",
    "all-servers": "All Servers",
    "manage-users": "Manage Users",
    "manage-tickets": "Manage Tickets"
};

function navigateTo(pageName) {
    const page = $(`#page-${CSS.escape(pageName)}`);

    if (!page) return;

    if (
        ["admin", "all-servers", "manage-users", "manage-tickets"].includes(pageName) &&
        !isStaff()
    ) {
        return;
    }

    $$(".page").forEach(section => section.classList.remove("active"));
    page.classList.add("active");

    $$(".nav-link").forEach(link => {
        link.classList.toggle("active", link.dataset.page === pageName);
    });

    $("#pageTitle").textContent = pageNames[pageName] || "ASTRIX CLOUD";

    closeSidebar();
    showIcons();

    if (pageName === "tickets") {
        loadTickets();
    }
}

document.addEventListener("click", event => {
    const navigationButton = event.target.closest("[data-page]");

    if (!navigationButton) return;

    const pageName = navigationButton.dataset.page;
    if (pageName) navigateTo(pageName);
});

/* ================= MOBILE SIDEBAR ================= */

function openSidebar() {
    $("#sidebar")?.classList.add("open");
    $("#sidebarOverlay")?.classList.add("active");
}

function closeSidebar() {
    $("#sidebar")?.classList.remove("open");
    $("#sidebarOverlay")?.classList.remove("active");
}

$("#menuToggle")?.addEventListener("click", openSidebar);
$("#closeSidebar")?.addEventListener("click", closeSidebar);
$("#sidebarOverlay")?.addEventListener("click", closeSidebar);

/* ================= LOGOUT ================= */

$("#logoutBtn")?.addEventListener("click", async () => {
    const button = $("#logoutBtn");
    if (button) button.disabled = true;

    try {
        await apiRequest(API.logout, { method: "POST" });
    } catch (error) {
        console.warn("Logout endpoint returned an error:", error);
    }

    currentUser = null;
    pendingSignupEmail = "";
    pendingSignupDetails = null;

    showLogin();
    showAuthForm("login");

    if (button) button.disabled = false;
});

/* ================= SERVER CONTROLS ================= */

/*
   These buttons intentionally do not send fake server commands.
   A real Pterodactyl-compatible server API must be configured first.
*/

function showServerConnectionNotice(action) {
    const output = $("#consoleOutput");
    if (!output) return;

    const line = document.createElement("div");
    line.className = "console-line warning-line";
    line.textContent =
        `[ASTRIX CLOUD] ${action}: server API connection is not configured.`;

    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
}

$("#startServerBtn")?.addEventListener("click", () => {
    showServerConnectionNotice("Start requested");
});

$("#restartServerBtn")?.addEventListener("click", () => {
    showServerConnectionNotice("Restart requested");
});

$("#stopServerBtn")?.addEventListener("click", () => {
    showServerConnectionNotice("Stop requested");
});

$("#consoleCommandForm")?.addEventListener("submit", event => {
    event.preventDefault();

    const input = $("#consoleCommand");
    const command = input?.value.trim();

    if (!command) return;

    showServerConnectionNotice(
        `Command not sent (${command}). Console API is not connected`
    );

    input.value = "";
});

/* ================= SUPPORT TICKETS ================= */

function normalizeList(result) {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result.tickets)) return result.tickets;
    if (Array.isArray(result.data)) return result.data;
    if (Array.isArray(result.data?.tickets)) return result.data.tickets;
    if (Array.isArray(result.users)) return result.users;
    return [];
}

function getTicketId(ticket) {
    return ticket.id ?? ticket.ticket_id ?? ticket.uuid;
}

function getTicketSubject(ticket) {
    return ticket.subject || ticket.title || "Support ticket";
}

function getTicketStatus(ticket) {
    return String(ticket.status || "open").toLowerCase();
}

function renderTicket(ticket, adminMode = false) {
    const id = getTicketId(ticket);
    const subject = escapeHTML(getTicketSubject(ticket));
    const status = escapeHTML(getTicketStatus(ticket));
    const category = escapeHTML(ticket.category || "General");
    const description = escapeHTML(ticket.message || ticket.description || "");

    const item = document.createElement("article");
    item.className = "ticket-item";

    item.innerHTML = `
        <div class="ticket-item-heading">
            <h4>${subject}</h4>
            <span class="ticket-status">${status}</span>
        </div>
        <p>${category}</p>
        ${description ? `<p>${description}</p>` : ""}
        <div class="ticket-actions">
            <button type="button" class="text-button ticket-reply-button">
                Reply
            </button>
            ${adminMode ? `
                <button type="button" class="text-button ticket-status-button">
                    ${status === "closed" ? "Reopen" : "Close"}
                </button>
            ` : ""}
        </div>
        <div class="ticket-replies"></div>
    `;

    const replyButton = $(".ticket-reply-button", item);

    replyButton?.addEventListener("click", async () => {
        if (id == null) return;

        const message = window.prompt("Enter your ticket reply:");
        if (!message || !message.trim()) return;

        replyButton.disabled = true;

        try {
            await apiRequest(API.ticketReplies, {
                method: "POST",
                body: {
                    ticket_id: id,
                    message: message.trim()
                }
            });

            await loadTicketReplies(id, $(".ticket-replies", item));
        } catch (error) {
            window.alert(error.message || "Unable to send reply.");
        } finally {
            replyButton.disabled = false;
        }
    });

    const statusButton = $(".ticket-status-button", item);

    statusButton?.addEventListener("click", async () => {
        if (id == null) return;

        const nextStatus = status === "closed" ? "open" : "closed";
        statusButton.disabled = true;

        try {
            await apiRequest(API.ticketStatus, {
                method: "PATCH",
                body: {
                    ticket_id: id,
                    status: nextStatus
                }
            });

            await loadTickets();
        } catch (error) {
            window.alert(error.message || "Unable to update ticket.");
        } finally {
            statusButton.disabled = false;
        }
    });

    return item;
}

async function loadTicketReplies(ticketId, container) {
    if (!container) return;

    container.textContent = "Loading replies...";

    try {
        const result = await apiRequest(
            `${API.ticketReplies}?ticket_id=${encodeURIComponent(ticketId)}`
        );

        const replies = normalizeList(result);
        container.replaceChildren();

        if (!replies.length) {
            container.textContent = "No replies yet.";
            return;
        }

        replies.forEach(reply => {
            const row = document.createElement("div");
            row.className = "ticket-reply";

            const author = document.createElement("strong");
            author.textContent = reply.username || reply.author || "User";

            const message = document.createElement("p");
            message.textContent = reply.message || "";

            row.append(author, message);
            container.appendChild(row);
        });

    } catch (error) {
        container.textContent = error.message || "Could not load replies.";
    }
}

async function loadTickets() {
    if (!currentUser || isLoadingTickets) return;

    isLoadingTickets = true;

    const myList = $("#myTicketsList");
    const adminList = $("#adminTicketsList");

    if (myList) myList.textContent = "Loading tickets...";
    if (adminList && isStaff()) adminList.textContent = "Loading tickets...";

    try {
        const result = await apiRequest(API.tickets);
        const tickets = normalizeList(result);

        if (myList) {
            myList.replaceChildren();

            if (!tickets.length) {
                myList.textContent = "You have no support tickets yet.";
            } else {
                tickets.forEach(ticket => {
                    myList.appendChild(renderTicket(ticket, false));
                });
            }
        }

        if (adminList && isStaff()) {
            adminList.replaceChildren();

            if (!tickets.length) {
                adminList.textContent = "No tickets available.";
            } else {
                tickets.forEach(ticket => {
                    adminList.appendChild(renderTicket(ticket, true));
                });
            }
        }

        showIcons();

    } catch (error) {
        if (myList) myList.textContent =
            error.message || "Unable to load tickets.";

        if (adminList && isStaff()) {
            adminList.textContent =
                error.message || "Unable to load tickets.";
        }
    } finally {
        isLoadingTickets = false;
    }
}

/* ================= CREATE TICKET ================= */

$("#ticketForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');

    const subject = $("#ticketSubject")?.value.trim();
    const category = $("#ticketCategory")?.value;
    const description = $("#ticketDescription")?.value.trim();

    if (!subject || !category || !description) {
        setMessage("#ticketFormMessage", "Complete all ticket fields.");
        return;
    }

    setButtonLoading(button, true, "Submitting...");
    setMessage("#ticketFormMessage", "");

    try {
        await apiRequest(API.tickets, {
            method: "POST",
            body: {
                subject,
                category,
                message: description
            }
        });

        form.reset();
        setMessage(
            "#ticketFormMessage",
            "Support ticket submitted successfully.",
            "success"
        );

        await loadTickets();

    } catch (error) {
        setMessage(
            "#ticketFormMessage",
            error.message || "Unable to submit ticket."
        );
    } finally {
        setButtonLoading(button, false);
    }
});

/* ================= ADMIN PLACEHOLDERS ================= */

async function loadAdminUsers() {
    const container = $("#usersList");
    if (!container || !isStaff()) return;

    container.textContent =
        "User management API is not connected yet.";
}

async function loadAdminServers() {
    const container = $("#allServersList");
    if (!container || !isStaff()) return;

    container.textContent =
        "Server provisioning API is not connected yet.";
}

/* ================= INITIALIZATION ================= */

async function initializePanel() {
    showIcons();

    $("#serverDisplayName").textContent = "My Minecraft Server";

    await restoreSession();

    if (currentUser && isStaff()) {
        loadAdminUsers();
        loadAdminServers();
    }
}

document.addEventListener("DOMContentLoaded", initializePanel);
