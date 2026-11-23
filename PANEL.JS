
"use strict";

/* ==========================================================
   ASTRIX CLOUD — CONTROL PANEL
   Home • Authentication • Navigation • Account • Support
   Owner Dashboard • Team Management • Role Protection
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
let isLoadingOwnerStats = false;
let isLoadingTeamAccounts = false;

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
        element.classList.add(
            type === "success" ? "success-message" : "error-message"
        );
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
            Accept: "application/json",
            ...(options.body ? {
                "Content-Type": "application/json"
            } : {}),
            ...(options.headers || {})
        },
        ...(options.body ? {
            body: JSON.stringify(options.body)
        } : {})
    };

    const response = await fetch(url, config);

    const contentType = response.headers.get("content-type") || "";
    let data = {};

    if (contentType.includes("application/json")) {
        data = await response.json();
    } else {
        const responseText = await response.text();
        data = responseText ? { message: responseText } : {};
    }

    if (!response.ok) {
        throw new Error(
            data.message ||
            data.error ||
            `Request failed (${response.status})`
        );
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

function isOwner(user = currentUser) {
    return getUserRole(user) === "owner";
}

function isAdmin(user = currentUser) {
    return getUserRole(user) === "admin";
}

function isStaff(user = currentUser) {
    return ["owner", "admin", "staff"].includes(getUserRole(user));
}

function canUseConsole(user = currentUser) {
    return ["owner", "admin"].includes(getUserRole(user));
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

/* ================= ROLE ACCESS CONTROL ================= */

function getAllowedRoles(element) {
    const value = element?.dataset?.allowedRoles;

    if (!value) return null;

    return value
        .split(",")
        .map(role => role.trim().toLowerCase())
        .filter(Boolean);
}

function canAccessPage(pageName) {
    if (!currentUser) return false;

    if (pageName === "home") return true;

    const serverPages = [
        "overview",
        "files",
        "databases",
        "schedules",
        "users",
        "backups",
        "network",
        "startup",
        "settings",
        "activity"
    ];

    if (serverPages.includes(pageName)) {
        return canUseConsole();
    }

    if (
        pageName === "admin" ||
        pageName === "team-management"
    ) {
        return isOwner();
    }

    if (
        ["all-servers", "manage-users", "manage-tickets"].includes(pageName)
    ) {
        return isStaff();
    }

    if (
        pageName === "tickets" ||
        pageName === "account"
    ) {
        return true;
    }

    const page = $(`#page-${CSS.escape(pageName)}`);

    if (!page) return false;

    const allowedRoles = getAllowedRoles(page);

    if (!allowedRoles) return true;

    return allowedRoles.includes(getUserRole());
}

function updateRoleVisibility() {
    if (!currentUser) return;

    $$("[data-allowed-roles]").forEach(element => {
        const allowedRoles = getAllowedRoles(element);

        if (!allowedRoles) return;

        const permitted = allowedRoles.includes(getUserRole());

        element.hidden = !permitted;
        element.setAttribute("aria-hidden", String(!permitted));
    });

    const serverPages = [
        "overview",
        "files",
        "databases",
        "schedules",
        "users",
        "backups",
        "network",
        "startup",
        "settings",
        "activity"
    ];

    serverPages.forEach(pageName => {
        const page = $(`#page-${pageName}`);
        if (page) page.hidden = !canUseConsole();
    });

    ["admin", "team-management"].forEach(pageName => {
        const page = $(`#page-${pageName}`);
        if (page) page.hidden = !isOwner();
    });

    const adminNavigation = $("#adminNavigation");

    if (adminNavigation) {
        adminNavigation.hidden = !isStaff();
    }

    const ownerNavigation = $('#adminNavigation [data-page="admin"]');

    if (ownerNavigation) {
        ownerNavigation.hidden = !isOwner();
    }

    const teamNavigation =
        $('#adminNavigation [data-page="team-management"]');

    if (teamNavigation) {
        teamNavigation.hidden = !isOwner();
    }
}

/* ================= LOGIN / DASHBOARD DISPLAY ================= */

function showLogin() {
    const loginPage = $(SELECTORS.loginPage);
    const dashboard = $(SELECTORS.dashboard);

    if (loginPage) loginPage.hidden = false;
    if (dashboard) dashboard.hidden = true;

    closeSidebar();
    showIcons();
}

function showDashboard() {
    const loginPage = $(SELECTORS.loginPage);
    const dashboard = $(SELECTORS.dashboard);

    if (loginPage) loginPage.hidden = true;
    if (dashboard) dashboard.hidden = false;

    updateUserInterface();
    updateRoleVisibility();

    navigateTo("home");

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
            throw new Error(
                "Login succeeded but user details could not be loaded."
            );
        }

        $("#loginPassword").value = "";

        showDashboard();
        await loadTickets();

    } catch (error) {
        setMessage(
            "#loginMessage",
            error.message || "Unable to sign in."
        );
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
        setMessage(
            "#signupMessage",
            "Username contains unsupported characters."
        );
        return;
    }

    if (password.length < 12 || password.length > 128) {
        setMessage(
            "#signupMessage",
            "Password must be 12–128 characters."
        );
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
        setMessage(
            "#signupMessage",
            error.message || "Unable to start signup."
        );
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
        setMessage(
            "#verifyMessage",
            "Signup session not found. Start again."
        );
        return;
    }

    if (!/^\d{6}$/.test(code || "")) {
        setMessage(
            "#verifyMessage",
            "Enter the six-digit verification code."
        );
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
        setMessage(
            "#verifyMessage",
            error.message || "Verification failed."
        );
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

    const setText = (selector, value) => {
        const element = $(selector);
        if (element) element.textContent = value;
    };

    setText("#sidebarUserName", name);
    setText("#sidebarUserRole", roleLabel);
    setText("#topbarUserName", name);

    setText("#accountName", name);
    setText("#accountEmail", email);
    setText("#accountRole", roleLabel);

    setText("#accountNameDetail", name);
    setText("#accountEmailDetail", email);
    setText("#accountRoleDetail", roleLabel);

    setText("#userAvatar", initials);
    setText("#topbarAvatar", initials);
    setText("#accountAvatar", initials);

    setText("#homeUserName", name);
    setText("#homeWelcomeName", name);
    setText("#homeUserRole", roleLabel);

    updateRoleVisibility();
    loadProfileLogo();
}

/* ================= OWNER DASHBOARD ================= */

const OWNER_STAT_KEYS = [
    "total_users",
    "owners",
    "admins",
    "staff",
    "members",
    "total_tickets",
    "open_tickets",
    "closed_tickets",
    "total_replies",
    "active_sessions"
];

function setOwnerStatus(message, type = "info") {
    const status = $("#ownerStatsStatus");

    if (!status) return;

    status.textContent = message;
    status.dataset.status = type;
}

function resetOwnerStats() {
    $$("[data-owner-stat]").forEach(element => {
        element.textContent = "—";
    });
}

function formatOwnerStat(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
        return "—";
    }

    return Math.floor(number).toLocaleString();
}

async function loadOwnerStats() {
    if (!isOwner() || isLoadingOwnerStats) return;

    const refreshButton = $("#refreshOwnerStats");

    isLoadingOwnerStats = true;

    if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.textContent = "Refreshing...";
    }

    setOwnerStatus("Loading live statistics...", "loading");
    resetOwnerStats();

    const ownerName = $("#ownerName");
    const ownerEmail = $("#ownerEmail");

    if (ownerName) ownerName.textContent = getUserName();
    if (ownerEmail) ownerEmail.textContent = getUserEmail();

    try {
        const result = await apiRequest(API.ownerStats);

        if (result.success !== true || !result.stats) {
            throw new Error(
                result.message || "The statistics response was invalid."
            );
        }

        const stats = result.stats;

        OWNER_STAT_KEYS.forEach(key => {
            $$(`[data-owner-stat="${key}"]`).forEach(element => {
                element.textContent = formatOwnerStat(stats[key]);
            });
        });

        if (result.owner) {
            if (ownerName) {
                ownerName.textContent =
                    result.owner.username || getUserName();
            }

            if (ownerEmail) {
                ownerEmail.textContent =
                    result.owner.email || getUserEmail();
            }
        }

        setOwnerStatus(
            "Statistics updated successfully.",
            "success"
        );

    } catch (error) {
        resetOwnerStats();

        setOwnerStatus(
            error.message || "Unable to load Owner statistics.",
            "error"
        );

        console.error("Owner statistics error:", error);

    } finally {
        isLoadingOwnerStats = false;

        if (refreshButton) {
            refreshButton.disabled = false;
            refreshButton.textContent = "Refresh Statistics";
        }
    }
}

$("#refreshOwnerStats")?.addEventListener("click", () => {
    if (isOwner()) loadOwnerStats();
});

/* ================= TEAM MANAGEMENT ================= */

function setTeamStatus(message, type = "error") {
    setMessage("#teamCreateMessage", message, type);
}

function normalizeTeamAccounts(result) {
    if (Array.isArray(result.accounts)) return result.accounts;
    if (Array.isArray(result.data?.accounts)) return result.data.accounts;
    if (Array.isArray(result.users)) return result.users;

    return [];
}

/* RESET A TEAM ACCOUNT PASSWORD */

async function resetTeamAccountPassword(account, button) {
    if (!isOwner()) {
        window.alert("Only the Owner can reset team passwords.");
        return;
    }

    const accountId = Number(account.id);

    if (!Number.isSafeInteger(accountId) || accountId < 1) {
        window.alert("This account has an invalid ID.");
        return;
    }

    if (accountId === Number(getUserId())) {
        window.alert(
            "You cannot reset your own password from Team Management."
        );
        return;
    }

    const username = account.username || "this account";

    const newPassword = window.prompt(
        `Enter a NEW password for ${username}.\n\nMinimum 12 characters.`
    );

    if (newPassword === null) return;

    if (newPassword.length < 12 || newPassword.length > 128) {
        window.alert(
            "Password must be between 12 and 128 characters."
        );
        return;
    }

    const confirmPassword = window.prompt(
        `Confirm the new password for ${username}.`
    );

    if (confirmPassword === null) return;

    if (newPassword !== confirmPassword) {
        window.alert("The passwords do not match. Nothing was changed.");
        return;
    }

    const confirmed = window.confirm(
        `Reset the password for ${username}?\n\nTheir existing sessions will be logged out.`
    );

    if (!confirmed) return;

    if (button) {
        button.disabled = true;
        button.textContent = "Resetting...";
    }

    try {
        const result = await apiRequest(API.teamUsers, {
            method: "POST",
            body: {
                action: "reset-password",
                user_id: accountId,
                password: newPassword
            }
        });

        if (result.success !== true) {
            throw new Error(
                result.error ||
                result.message ||
                "Password reset failed."
            );
        }

        window.alert(
            result.message || "Password reset successfully."
        );

        await loadTeamAccounts();

    } catch (error) {
        window.alert(
            error.message || "Unable to reset this account password."
        );

        if (button) {
            button.disabled = false;
            button.textContent = "Reset Password";
        }

        console.error("Team password reset error:", error);
    }
}

/* RENDER TEAM ACCOUNT */

function renderTeamAccount(account) {
    const item = document.createElement("article");
    item.className = "team-account-item";

    const details = document.createElement("div");
    details.className = "team-account-details";

    const username = document.createElement("h4");
    username.textContent = account.username || "Unknown user";

    const email = document.createElement("p");
    email.textContent = account.email || "No email";

    const role = document.createElement("span");
    role.className = "team-account-role";
    role.textContent = String(account.role || "staff").toUpperCase();

    details.append(username, email);

    const actions = document.createElement("div");
    actions.className = "team-account-actions";

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "text-button team-reset-password";
    resetButton.textContent = "Reset Password";

    const isCurrentAccount =
        Number(account.id) === Number(getUserId());

    if (isCurrentAccount) {
        resetButton.disabled = true;
        resetButton.textContent = "Your Account";
        resetButton.title =
            "Change your own password through account settings.";
    } else {
        resetButton.addEventListener("click", () => {
            resetTeamAccountPassword(account, resetButton);
        });
    }

    actions.appendChild(resetButton);

    item.append(details, role, actions);

    return item;
}

/* LOAD TEAM ACCOUNTS */

async function loadTeamAccounts() {
    if (!isOwner()) return;

    const container = $("#teamAccountsList");

    if (!container || isLoadingTeamAccounts) return;

    isLoadingTeamAccounts = true;
    container.textContent = "Loading team accounts...";

    try {
        const result = await apiRequest(API.teamUsers);

        if (result.success !== true) {
            throw new Error(
                result.error || "Unable to load team accounts."
            );
        }

        const accounts = normalizeTeamAccounts(result);

        container.replaceChildren();

        if (!accounts.length) {
            container.textContent =
                "No Owner, Admin or Staff accounts have been created yet.";
            return;
        }

        accounts.forEach(account => {
            container.appendChild(renderTeamAccount(account));
        });

    } catch (error) {
        container.textContent =
            error.message || "Unable to load team accounts.";

        console.error("Team account loading error:", error);

    } finally {
        isLoadingTeamAccounts = false;
    }
}

/* SHOW / HIDE TEAM PASSWORD */

$("#toggleTeamPassword")?.addEventListener("click", () => {
    const passwordInput = $("#teamPassword");
    const toggleButton = $("#toggleTeamPassword");

    if (!passwordInput || !toggleButton) return;

    const isVisible = passwordInput.type === "text";

    passwordInput.type = isVisible ? "password" : "text";

    toggleButton.setAttribute(
        "aria-label",
        isVisible ? "Show password" : "Hide password"
    );

    toggleButton.setAttribute(
        "title",
        isVisible ? "Show password" : "Hide password"
    );

    const icon = $("i", toggleButton);

    if (icon) {
        icon.setAttribute(
            "data-lucide",
            isVisible ? "eye" : "eye-off"
        );
    }

    showIcons();
});

/* CREATE TEAM ACCOUNT */

$("#teamCreateForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    if (!isOwner()) {
        setTeamStatus("Only the Owner can create team accounts.");
        return;
    }

    const form = event.currentTarget;

    const button = $("#createTeamAccountBtn") ||
        form.querySelector('button[type="submit"]');

    const username = $("#teamUsername")?.value.trim();
    const email = $("#teamEmail")?.value.trim().toLowerCase();
    const password = $("#teamPassword")?.value;
    const role = $("#teamRole")?.value;

    if (!username || !email || !password || !role) {
        setTeamStatus("Please complete all fields.");
        return;
    }

    if (!/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
        setTeamStatus(
            "Username must be 3–30 characters using letters, numbers, _ or -."
        );
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setTeamStatus("Please enter a valid email address.");
        return;
    }

    if (password.length < 12 || password.length > 128) {
        setTeamStatus("Password must be 12–128 characters.");
        return;
    }

    if (!["owner", "admin", "staff"].includes(role)) {
        setTeamStatus("Choose a valid account role.");
        return;
    }

    setButtonLoading(button, true, "Creating account...");
    setTeamStatus("");

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

        if (result.success !== true) {
            throw new Error(
                result.error ||
                result.message ||
                "Account creation failed."
            );
        }

        form.reset();

        const passwordInput = $("#teamPassword");

        if (passwordInput) {
            passwordInput.type = "password";
        }

        const toggleIcon = $("#toggleTeamPassword i");

        if (toggleIcon) {
            toggleIcon.setAttribute("data-lucide", "eye");
        }

        showIcons();

        setTeamStatus(
            result.message || "Account created successfully.",
            "success"
        );

        await loadTeamAccounts();

        if (isOwner()) {
            loadOwnerStats();
        }

    } catch (error) {
        setTeamStatus(
            error.message || "Unable to create team account."
        );

        console.error("Team account creation error:", error);

    } finally {
        setButtonLoading(button, false);
    }
});

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
            const image = document.createElement("img");
            image.src = logo;
            image.alt = "Profile image";

            avatar.replaceChildren(image);
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
        setMessage(
            "#logoMessage",
            "Choose a PNG, JPG or WEBP image."
        );

        event.target.value = "";
        return;
    }

    if (file.size > 1024 * 1024) {
        setMessage(
            "#logoMessage",
            "Image must be smaller than 1 MB."
        );

        event.target.value = "";
        return;
    }

    const reader = new FileReader();

    reader.onload = () => {
        try {
            localStorage.setItem(
                getProfileLogoKey(),
                reader.result
            );

            loadProfileLogo();

            setMessage(
                "#logoMessage",
                "Profile image updated.",
                "success"
            );
        } catch {
            setMessage(
                "#logoMessage",
                "Unable to save this image in browser storage."
            );
        }
    };

    reader.onerror = () => {
        setMessage("#logoMessage", "Unable to read this image.");
    };

    reader.readAsDataURL(file);
});

/* ================= NAVIGATION ================= */

const pageNames = {
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
    admin: "Owner Dashboard",
    "team-management": "Team Management",
    "all-servers": "All Servers",
    "manage-users": "Manage Users",
    "manage-tickets": "Manage Tickets"
};

function navigateTo(pageName) {
    if (!currentUser) return false;

    const page = $(`#page-${CSS.escape(pageName)}`);

    if (!page) return false;

    if (!canAccessPage(pageName)) {
        console.warn(
            `Access denied: ${pageName} for role ${getUserRole()}`
        );

        if (pageName !== "home") {
            navigateTo("home");
        }

        return false;
    }

    $$(".page").forEach(section => {
        section.classList.remove("active");
    });

    page.classList.add("active");

    $$(".nav-link").forEach(link => {
        link.classList.toggle(
            "active",
            link.dataset.page === pageName
        );
    });

    const pageTitle = $("#pageTitle");

    if (pageTitle) {
        pageTitle.textContent =
            pageNames[pageName] || "ASTRIX CLOUD";
    }

    closeSidebar();
    showIcons();

    if (pageName === "tickets") {
        loadTickets();
    }

    if (pageName === "admin" && isOwner()) {
        loadOwnerStats();
    }

    if (pageName === "team-management" && isOwner()) {
        loadTeamAccounts();
    }

    if (pageName === "manage-users" && isStaff()) {
        loadAdminUsers();
    }

    if (pageName === "all-servers" && isStaff()) {
        loadAdminServers();
    }

    return true;
}

document.addEventListener("click", event => {
    const navigationButton = event.target.closest("[data-page]");

    if (!navigationButton) return;

    const pageName = navigationButton.dataset.page;

    if (!pageName) return;

    event.preventDefault();
    navigateTo(pageName);
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
        await apiRequest(API.logout, {
            method: "POST"
        });
    } catch (error) {
        console.warn(
            "Logout endpoint returned an error:",
            error
        );
    }

    currentUser = null;
    pendingSignupEmail = "";
    pendingSignupDetails = null;

    resetOwnerStats();

    const teamList = $("#teamAccountsList");
    if (teamList) teamList.replaceChildren();

    const ticketsList = $("#myTicketsList");
    if (ticketsList) ticketsList.replaceChildren();

    const adminTicketsList = $("#adminTicketsList");
    if (adminTicketsList) adminTicketsList.replaceChildren();

    showLogin();
    showAuthForm("login");

    if (button) button.disabled = false;
});

/* ================= SERVER CONTROLS ================= */

function showServerConnectionNotice(action) {
    if (!canUseConsole()) {
        navigateTo("home");
        return;
    }

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
    if (!canUseConsole()) return;

    showServerConnectionNotice("Start requested");
});

$("#restartServerBtn")?.addEventListener("click", () => {
    if (!canUseConsole()) return;

    showServerConnectionNotice("Restart requested");
});

$("#stopServerBtn")?.addEventListener("click", () => {
    if (!canUseConsole()) return;

    showServerConnectionNotice("Stop requested");
});

$("#consoleCommandForm")?.addEventListener("submit", event => {
    event.preventDefault();

    if (!canUseConsole()) {
        navigateTo("home");
        return;
    }

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

    const description = escapeHTML(
        ticket.message || ticket.description || ""
    );

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

        const message = window.prompt(
            "Enter your ticket reply:"
        );

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

            await loadTicketReplies(
                id,
                $(".ticket-replies", item)
            );

        } catch (error) {
            window.alert(
                error.message || "Unable to send reply."
            );
        } finally {
            replyButton.disabled = false;
        }
    });

    const statusButton = $(".ticket-status-button", item);

    statusButton?.addEventListener("click", async () => {
        if (id == null || !isStaff()) return;

        const nextStatus =
            status === "closed" ? "open" : "closed";

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
            window.alert(
                error.message || "Unable to update ticket."
            );
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
            author.textContent =
                reply.username || reply.author || "User";

            const message = document.createElement("p");
            message.textContent = reply.message || "";

            row.append(author, message);
            container.appendChild(row);
        });

    } catch (error) {
        container.textContent =
            error.message || "Could not load replies.";
    }
}

async function loadTickets() {
    if (!currentUser || isLoadingTickets) return;

    isLoadingTickets = true;

    const myList = $("#myTicketsList");
    const adminList = $("#adminTicketsList");

    if (myList) {
        myList.textContent = "Loading tickets...";
    }

    if (adminList && isStaff()) {
        adminList.textContent = "Loading tickets...";
    }

    try {
        const result = await apiRequest(API.tickets);
        const tickets = normalizeList(result);

        if (myList) {
            myList.replaceChildren();

            if (!tickets.length) {
                myList.textContent =
                    "You have no support tickets yet.";
            } else {
                tickets.forEach(ticket => {
                    myList.appendChild(
                        renderTicket(ticket, false)
                    );
                });
            }
        }

        if (adminList && isStaff()) {
            adminList.replaceChildren();

            if (!tickets.length) {
                adminList.textContent =
                    "No tickets available.";
            } else {
                tickets.forEach(ticket => {
                    adminList.appendChild(
                        renderTicket(ticket, true)
                    );
                });
            }
        }

        showIcons();

    } catch (error) {
        if (myList) {
            myList.textContent =
                error.message || "Unable to load tickets.";
        }

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

    if (!currentUser) return;

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');

    const subject = $("#ticketSubject")?.value.trim();
    const category = $("#ticketCategory")?.value;
    const description = $("#ticketDescription")?.value.trim();

    if (!subject || !category || !description) {
        setMessage(
            "#ticketFormMessage",
            "Complete all ticket fields."
        );
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

    const serverDisplayName = $("#serverDisplayName");

    if (serverDisplayName) {
        serverDisplayName.textContent = "My Minecraft Server";
    }

    await restoreSession();

    if (currentUser && isStaff()) {
        loadAdminUsers();
        loadAdminServers();
    }
}

document.addEventListener(
    "DOMContentLoaded",
    initializePanel
);
