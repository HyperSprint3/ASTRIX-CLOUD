
/* =========================================================
   ASTRIX CLOUD — CONTROL PANEL
   Complete PANEL.JS
========================================================= */

"use strict";

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       CONFIGURATION
    ===================================================== */

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

    let currentUser = null;
    let pendingSignupEmail = "";
    let currentPage = "overview";
    let loadedReplyTickets = new Set();

    const $ = (selector, parent = document) =>
        parent.querySelector(selector);

    const $$ = (selector, parent = document) =>
        [...parent.querySelectorAll(selector)];


    /* =====================================================
       ELEMENTS
    ===================================================== */

    const loginPage = $("#loginPage");
    const dashboard = $("#dashboard");
    const sidebar = $("#sidebar");
    const sidebarOverlay = $("#sidebarOverlay");
    const menuToggle = $("#menuToggle");

    const loginForm = $("#loginForm");
    const signupForm = $("#signupForm");
    const verifyForm = $("#verifyForm");

    const loginMessage = $("#loginMessage");
    const signupMessage = $("#signupMessage");
    const verifyMessage = $("#verifyMessage");

    const ticketForm = $("#ticketForm");
    const createServerForm = $("#createServerForm");


    /* =====================================================
       HELPERS
    ===================================================== */

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
        const cleanName = String(name || "User").trim();
        return cleanName.charAt(0).toUpperCase() || "U";
    }

    function getUserId() {
        return currentUser?.id ??
            currentUser?.user_id ??
            currentUser?.email ??
            "default";
    }

    function getRole() {
        return String(currentUser?.role || "member").toLowerCase();
    }

    function isStaff() {
        return ["owner", "admin", "staff"].includes(getRole());
    }

    function showMessage(element, message, success = false) {
        if (!element) return;

        element.textContent = message;
        element.style.color = success ? "#38e6a4" : "#ff8299";
    }

    function clearMessage(element) {
        if (!element) return;

        element.textContent = "";
    }

    function setLoading(button, loading, loadingText = "Please wait...") {
        if (!button) return;

        if (loading) {
            button.dataset.originalText = button.innerHTML;
            button.disabled = true;
            button.innerHTML = loadingText;
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

        const text = await response.text();

        let result = {};

        try {
            result = text ? JSON.parse(text) : {};
        } catch {
            result = { message: text };
        }

        if (!response.ok || result.success === false) {
            throw new Error(
                result.error ||
                result.message ||
                `Request failed (${response.status})`
            );
        }

        return result;
    }

    function extractUser(result) {
        if (result?.user) return result.user;
        if (result?.data?.user) return result.data.user;
        if (result?.data && result.data.id) return result.data;
        return result;
    }

    function extractList(result, possibleKeys = []) {
        if (Array.isArray(result)) return result;

        for (const key of possibleKeys) {
            if (Array.isArray(result?.[key])) {
                return result[key];
            }
        }

        if (Array.isArray(result?.data)) {
            return result.data;
        }

        return [];
    }

    function formatDate(value) {
        if (!value) return "Recently";

        const date = new Date(
            typeof value === "number" && value < 1000000000000
                ? value * 1000
                : value
        );

        if (Number.isNaN(date.getTime())) return "Recently";

        return date.toLocaleString();
    }


    /* =====================================================
       AUTHENTICATION PAGE SWITCHING
    ===================================================== */

    function showLogin() {
        if (loginForm) loginForm.style.display = "block";
        if (signupForm) signupForm.style.display = "none";
        if (verifyForm) verifyForm.style.display = "none";

        clearMessage(loginMessage);
        clearMessage(signupMessage);
        clearMessage(verifyMessage);
    }

    function showSignup() {
        if (loginForm) loginForm.style.display = "none";
        if (signupForm) signupForm.style.display = "block";
        if (verifyForm) verifyForm.style.display = "none";

        clearMessage(loginMessage);
        clearMessage(signupMessage);
        clearMessage(verifyMessage);
    }

    function showVerification() {
        if (loginForm) loginForm.style.display = "none";
        if (signupForm) signupForm.style.display = "none";
        if (verifyForm) verifyForm.style.display = "block";

        clearMessage(loginMessage);
        clearMessage(signupMessage);
        clearMessage(verifyMessage);
    }

    $("#showSignupBtn")?.addEventListener("click", showSignup);
    $("#showLoginBtn")?.addEventListener("click", showLogin);


    /* =====================================================
       LOGIN
    ===================================================== */

    loginForm?.addEventListener("submit", async event => {
        event.preventDefault();

        const button = $('button[type="submit"]', loginForm);
        const email = $("#loginEmail")?.value.trim();
        const password = $("#loginPassword")?.value;

        if (!email || !password) {
            showMessage(loginMessage, "Enter your email and password.");
            return;
        }

        clearMessage(loginMessage);
        setLoading(button, true, "Signing in...");

        try {
            const result = await apiRequest(API.login, {
                method: "POST",
                body: JSON.stringify({ email, password })
            });

            const user = extractUser(result);

            if (!user || (!user.id && !user.user_id && !user.email)) {
                throw new Error("Login succeeded but user information was not returned.");
            }

            currentUser = user;
            loginForm.reset();

            await showDashboard();

        } catch (error) {
            showMessage(loginMessage, error.message || "Unable to sign in.");
        } finally {
            setLoading(button, false);
        }
    });


    /* =====================================================
       SIGNUP — SEND VERIFICATION CODE
    ===================================================== */

    signupForm?.addEventListener("submit", async event => {
        event.preventDefault();

        const button = $('button[type="submit"]', signupForm);

        const username = $("#signupUsername")?.value.trim();
        const email = $("#signupEmail")?.value.trim().toLowerCase();
        const password = $("#signupPassword")?.value;

        if (!username || !email || !password) {
            showMessage(signupMessage, "Please complete all fields.");
            return;
        }

        if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
            showMessage(
                signupMessage,
                "Username must be 3–30 characters and use only letters, numbers or underscores."
            );
            return;
        }

        if (password.length < 12 || password.length > 128) {
            showMessage(
                signupMessage,
                "Password must be between 12 and 128 characters."
            );
            return;
        }

        clearMessage(signupMessage);
        setLoading(button, true, "Sending code...");

        try {
            await apiRequest(API.sendVerification, {
                method: "POST",
                body: JSON.stringify({
                    username,
                    email,
                    password
                })
            });

            pendingSignupEmail = email;

            showVerification();

            showMessage(
                verifyMessage,
                "Verification code sent. Check your email.",
                true
            );

        } catch (error) {
            showMessage(
                signupMessage,
                error.message || "Could not send verification code."
            );
        } finally {
            setLoading(button, false);
        }
    });


    /* =====================================================
       SIGNUP — VERIFY EMAIL
    ===================================================== */

    verifyForm?.addEventListener("submit", async event => {
        event.preventDefault();

        const button = $('button[type="submit"]', verifyForm);
        const code = $("#verificationCode")?.value.trim();

        if (!pendingSignupEmail) {
            showMessage(
                verifyMessage,
                "Signup session not found. Please start again."
            );
            showSignup();
            return;
        }

        if (!/^\d{6}$/.test(code || "")) {
            showMessage(
                verifyMessage,
                "Enter a valid six-digit verification code."
            );
            return;
        }

        clearMessage(verifyMessage);
        setLoading(button, true, "Verifying...");

        try {
            await apiRequest(API.verifySignup, {
                method: "POST",
                body: JSON.stringify({
                    email: pendingSignupEmail,
                    code
                })
            });

            pendingSignupEmail = "";

            verifyForm.reset();
            signupForm?.reset();

            showLogin();

            showMessage(
                loginMessage,
                "Account created successfully! You can now sign in.",
                true
            );

        } catch (error) {
            showMessage(
                verifyMessage,
                error.message || "Verification failed."
            );
        } finally {
            setLoading(button, false);
        }
    });


    /* =====================================================
       SHOW LOGIN / DASHBOARD
    ===================================================== */

    function showLoginPage() {
        currentUser = null;

        if (dashboard) {
            dashboard.style.display = "none";
            dashboard.classList.add("hidden");
        }

        if (loginPage) {
            loginPage.style.display = "flex";
        }

        closeSidebar();
        showLogin();
    }

    async function showDashboard() {
        if (!currentUser) {
            showLoginPage();
            return;
        }

        if (loginPage) {
            loginPage.style.display = "none";
        }

        if (dashboard) {
            dashboard.classList.remove("hidden");
            dashboard.style.display = "flex";
        }

        updateUserDetails();
        updatePermissions();

        navigateTo("overview");

        await loadTickets();

        showServerNotice();
    }


    /* =====================================================
       RESTORE EXISTING SESSION
    ===================================================== */

    async function restoreSession() {
        try {
            const result = await apiRequest(API.me, {
                method: "GET",
                headers: {}
            });

            const user = extractUser(result);

            if (!user || (!user.id && !user.user_id && !user.email)) {
                throw new Error("No active session.");
            }

            currentUser = user;

            await showDashboard();

        } catch {
            showLoginPage();
        }
    }


    /* =====================================================
       LOGOUT
    ===================================================== */

    $("#logoutBtn")?.addEventListener("click", async () => {
        const button = $("#logoutBtn");

        if (button) button.disabled = true;

        try {
            await apiRequest(API.logout, {
                method: "POST",
                body: JSON.stringify({})
            });
        } catch (error) {
            console.warn("Logout request:", error.message);
        }

        showLoginPage();

        if (button) button.disabled = false;
    });


    /* =====================================================
       PROFILE INFORMATION
    ===================================================== */

    function updateUserDetails() {
        if (!currentUser) return;

        const username =
            currentUser.username ||
            currentUser.name ||
            currentUser.email ||
            "User";

        const email = currentUser.email || "Not available";
        const role = getRole();

        const elements = {
            sidebarUserName: username,
            sidebarUserRole: role,
            topbarUserName: username,
            accountName: username,
            accountEmail: email,
            accountRole: role,
            welcomeName: username
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });

        const initials = getInitials(username);

        ["userAvatar", "topbarAvatar", "accountAvatar"].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = initials;
        });

        loadAccountLogo();
    }


    /* =====================================================
       ACCOUNT LOGO CHANGER
    ===================================================== */

    function logoStorageKey() {
        return `astrix_profile_logo_${getUserId()}`;
    }

    function applyLogo(element, logo) {
        if (!element) return;

        element.replaceChildren();

        if (logo) {
            const image = document.createElement("img");
            image.src = logo;
            image.alt = "Profile logo";
            element.appendChild(image);
        } else {
            element.textContent = getInitials(
                currentUser?.username ||
                currentUser?.name ||
                currentUser?.email
            );
        }
    }

    function loadAccountLogo() {
        let logo = null;

        try {
            logo = localStorage.getItem(logoStorageKey());
        } catch (error) {
            console.warn("Could not read profile logo:", error);
        }

        ["userAvatar", "topbarAvatar", "accountAvatar"].forEach(id => {
            applyLogo(document.getElementById(id), logo);
        });
    }

    $("#accountLogoInput")?.addEventListener("change", event => {
        const file = event.target.files?.[0];

        if (!file) return;

        const message = $("#logoMessage");

        const allowedTypes = [
            "image/png",
            "image/jpeg",
            "image/webp"
        ];

        if (!allowedTypes.includes(file.type)) {
            showMessage(
                message,
                "Choose a PNG, JPG or WEBP image."
            );
            event.target.value = "";
            return;
        }

        if (file.size > 1024 * 1024) {
            showMessage(
                message,
                "Image must be smaller than 1 MB."
            );
            event.target.value = "";
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            try {
                const logo = reader.result;

                localStorage.setItem(logoStorageKey(), logo);

                loadAccountLogo();

                showMessage(
                    message,
                    "Profile logo updated on this browser.",
                    true
                );

            } catch (error) {
                showMessage(
                    message,
                    "Could not save image. Browser storage may be full."
                );
            }
        };

        reader.onerror = () => {
            showMessage(message, "Could not read the image.");
        };

        reader.readAsDataURL(file);
    });


    /* =====================================================
       ROLE PERMISSIONS
    ===================================================== */

    function updatePermissions() {
        const adminNavigation = $("#adminNavigation");

        if (adminNavigation) {
            adminNavigation.style.display = isStaff() ? "block" : "none";
        }

        if (!isStaff() && [
            "create-server",
            "all-servers",
            "manage-users",
            "manage-tickets"
        ].includes(currentPage)) {
            navigateTo("overview");
        }
    }


    /* =====================================================
       PAGE NAVIGATION
    ===================================================== */

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
        const allowedPages = Object.keys(pageTitles);

        if (!allowedPages.includes(page)) return;

        const adminPages = [
            "create-server",
            "all-servers",
            "manage-users",
            "manage-tickets"
        ];

        if (adminPages.includes(page) && !isStaff()) {
            page = "overview";
        }

        currentPage = page;

        $$(".page").forEach(section => {
            section.classList.remove("active");
        });

        const targetPage = document.getElementById(`page-${page}`);

        if (targetPage) {
            targetPage.classList.add("active");
        }

        $$(".navigation .nav-link").forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.page === page
            );
        });

        const title = $("#pageTitle");

        if (title) {
            title.textContent = pageTitles[page];
        }

        closeSidebar();

        if (page === "tickets" || page === "manage-tickets") {
            loadTickets();
        }

        if (page === "servers" || page === "all-servers" || page === "overview") {
            showServerNotice();
        }
    }

    document.addEventListener("click", event => {
        const button = event.target.closest("[data-page]");

        if (!button) return;

        event.preventDefault();
        navigateTo(button.dataset.page);
    });


    /* =====================================================
       MOBILE SIDEBAR
    ===================================================== */

    function openSidebar() {
        sidebar?.classList.add("open");
        sidebarOverlay?.classList.add("active");
    }

    function closeSidebar() {
        sidebar?.classList.remove("open");
        sidebarOverlay?.classList.remove("active");
    }

    menuToggle?.addEventListener("click", () => {
        if (sidebar?.classList.contains("open")) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    sidebarOverlay?.addEventListener("click", closeSidebar);

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeSidebar();
        }
    });


    /* =====================================================
       SERVER PLACEHOLDERS
       Real provisioning requires a connected hosting node.
    ===================================================== */

    function showServerNotice() {
        const notice =
            "Hosting node integration is not connected yet. Server information will appear here after provisioning is configured.";

        const recentServers = $("#recentServers");
        const myServersList = $("#myServersList");
        const allServersList = $("#allServersList");

        if (recentServers) {
            recentServers.textContent = notice;
        }

        if (myServersList) {
            myServersList.textContent = notice;
        }

        if (allServersList) {
            allServersList.textContent = notice;
        }

        ["totalServers", "onlineServers", "offlineServers"].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = "—";
        });
    }

    createServerForm?.addEventListener("submit", event => {
        event.preventDefault();

        showMessage(
            $("#createServerMessage"),
            "Server creation is not connected yet. A hosting node and provisioning API are required."
        );
    });

    const usersList = $("#usersList");

    if (usersList) {
        usersList.textContent =
            "User management API is not connected yet.";
    }


    /* =====================================================
       TICKET DATA
    ===================================================== */

    function getTicketId(ticket) {
        return ticket.id ?? ticket.ticket_id ?? "";
    }

    function getTicketStatus(ticket) {
        return String(ticket.status || "open").toLowerCase();
    }

    function ticketCard(ticket, staffView = false) {
        const id = getTicketId(ticket);
        const subject = escapeHTML(ticket.subject || "Untitled ticket");
        const category = escapeHTML(ticket.category || "General");
        const description = escapeHTML(ticket.description || "");
        const status = getTicketStatus(ticket);
        const date = escapeHTML(
            formatDate(ticket.created_at || ticket.createdAt)
        );

        const owner = escapeHTML(
            ticket.username ||
            ticket.user_name ||
            ticket.email ||
            "Member"
        );

        const statusColor = status === "closed"
            ? "#ff8299"
            : "#38e6a4";

        return `
            <article class="content-card ticket-entry"
                data-ticket-id="${escapeHTML(id)}"
                style="margin-top:14px;">

                <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;">

                    <div>
                        <h3 style="font-size:14px;margin-bottom:7px;">
                            ${subject}
                        </h3>

                        <span style="font-size:10px;color:#9691ad;">
                            ${category} · ${date}
                        </span>

                        ${staffView ? `
                            <div style="font-size:10px;color:#9691ad;margin-top:6px;">
                                Submitted by: ${owner}
                            </div>
                        ` : ""}
                    </div>

                    <span style="
                        padding:7px 11px;
                        border-radius:20px;
                        font-size:10px;
                        color:${statusColor};
                        background:${status === "closed"
                            ? "rgba(255,102,133,.10)"
                            : "rgba(56,230,164,.10)"};
                    ">
                        ${escapeHTML(status.toUpperCase())}
                    </span>

                </div>

                <p style="
                    margin-top:14px;
                    color:#aaa4bb;
                    font-size:12px;
                    line-height:1.7;
                    overflow-wrap:anywhere;
                ">${description}</p>

                <div style="
                    display:flex;
                    gap:9px;
                    flex-wrap:wrap;
                    margin-top:17px;
                ">

                    <button type="button"
                        class="primary-btn"
                        data-load-replies="${escapeHTML(id)}"
                        style="min-height:35px;font-size:10px;">
                        View Replies
                    </button>

                    ${staffView ? `
                        <button type="button"
                            class="primary-btn"
                            data-ticket-status="${escapeHTML(id)}"
                            data-next-status="${status === "closed" ? "open" : "closed"}"
                            style="
                                min-height:35px;
                                font-size:10px;
                                background:${status === "closed"
                                    ? "linear-gradient(110deg,#8850ed,#a56cff)"
                                    : "linear-gradient(110deg,#b65a75,#e56b8a)"};
                            ">
                            ${status === "closed" ? "Reopen Ticket" : "Close Ticket"}
                        </button>
                    ` : ""}

                </div>

                <div class="ticket-replies"
                    id="ticket-replies-${escapeHTML(id)}"
                    style="margin-top:15px;">
                </div>

                ${status !== "closed" ? `
                    <form class="ticket-reply-form"
                        data-reply-ticket="${escapeHTML(id)}"
                        style="margin-top:12px;">

                        <label>Write a reply</label>

                        <textarea name="message"
                            maxlength="5000"
                            placeholder="Write your message..."
                            required
                            style="width:100%;min-height:85px;"></textarea>

                        <button type="submit"
                            class="primary-btn"
                            style="margin-top:10px;min-height:36px;font-size:10px;">
                            Send Reply →
                        </button>

                        <p class="message reply-message"></p>
                    </form>
                ` : ""}

            </article>
        `;
    }


    /* =====================================================
       LOAD TICKETS
    ===================================================== */

    async function loadTickets() {
        if (!currentUser) return;

        const memberList = $("#myTicketsList");
        const staffList = $("#adminTicketsList");

        if (memberList) {
            memberList.textContent = "Loading your tickets...";
        }

        if (staffList && isStaff()) {
            staffList.textContent = "Loading support tickets...";
        }

        try {
            const result = await apiRequest(API.tickets, {
                method: "GET",
                headers: {}
            });

            const tickets = extractList(result, [
                "tickets",
                "results"
            ]);

            loadedReplyTickets.clear();

            const memberTickets = tickets.filter(ticket => {
                if (isStaff()) return true;

                const ticketUserId =
                    ticket.user_id ??
                    ticket.userId ??
                    ticket.user?.id;

                return String(ticketUserId) === String(getUserId());
            });

            if (memberList) {
                memberList.innerHTML = memberTickets.length
                    ? memberTickets.map(ticket => ticketCard(ticket)).join("")
                    : `<div class="empty-state">You haven't created any support tickets yet.</div>`;
            }

            if (staffList && isStaff()) {
                staffList.innerHTML = tickets.length
                    ? tickets.map(ticket => ticketCard(ticket, true)).join("")
                    : `<div class="empty-state">There are no support tickets yet.</div>`;
            }

            const totalTickets = $("#totalTickets");

            if (totalTickets) {
                totalTickets.textContent = isStaff()
                    ? tickets.length
                    : memberTickets.length;
            }

        } catch (error) {
            if (memberList) {
                memberList.textContent =
                    `Could not load tickets: ${error.message}`;
            }

            if (staffList && isStaff()) {
                staffList.textContent =
                    `Could not load tickets: ${error.message}`;
            }
        }
    }


    /* =====================================================
       CREATE SUPPORT TICKET
    ===================================================== */

    ticketForm?.addEventListener("submit", async event => {
        event.preventDefault();

        if (!currentUser) return;

        const button = $('button[type="submit"]', ticketForm);

        const subject = $("#ticketSubject")?.value.trim();
        const category = $("#ticketCategory")?.value;
        const description = $("#ticketDescription")?.value.trim();

        if (!subject || !category || !description) {
            return;
        }

        setLoading(button, true, "Submitting...");

        try {
            await apiRequest(API.tickets, {
                method: "POST",
                body: JSON.stringify({
                    subject,
                    category,
                    description
                })
            });

            ticketForm.reset();

            alert("Support ticket created successfully!");

            await loadTickets();

        } catch (error) {
            alert(error.message || "Could not create support ticket.");
        } finally {
            setLoading(button, false);
        }
    });


    /* =====================================================
       LOAD TICKET REPLIES
    ===================================================== */

    async function loadReplies(ticketId, container) {
        if (!container) return;

        container.textContent = "Loading replies...";

        try {
            const result = await apiRequest(
                `${API.ticketReplies}?ticket_id=${encodeURIComponent(ticketId)}`,
                {
                    method: "GET",
                    headers: {}
                }
            );

            const replies = extractList(result, [
                "replies",
                "messages",
                "results"
            ]);

            loadedReplyTickets.add(String(ticketId));

            if (!replies.length) {
                container.innerHTML =
                    `<div class="empty-state">No replies yet.</div>`;
                return;
            }

            container.innerHTML = replies.map(reply => {
                const sender = escapeHTML(
                    reply.username ||
                    reply.user_name ||
                    reply.email ||
                    reply.role ||
                    "User"
                );

                const message = escapeHTML(reply.message || "");
                const date = escapeHTML(
                    formatDate(reply.created_at || reply.createdAt)
                );

                return `
                    <div style="
                        padding:13px;
                        margin-top:9px;
                        border:1px solid rgba(255,255,255,.07);
                        border-radius:10px;
                        background:rgba(255,255,255,.025);
                    ">
                        <div style="
                            display:flex;
                            justify-content:space-between;
                            gap:10px;
                            flex-wrap:wrap;
                        ">
                            <strong style="font-size:11px;color:#c6a8ff;">
                                ${sender}
                            </strong>
                            <span style="font-size:9px;color:#77718e;">
                                ${date}
                            </span>
                        </div>

                        <p style="
                            margin-top:9px;
                            color:#c1bbd1;
                            font-size:11px;
                            line-height:1.7;
                            white-space:pre-wrap;
                            overflow-wrap:anywhere;
                        ">${message}</p>
                    </div>
                `;
            }).join("");

        } catch (error) {
            container.textContent =
                `Could not load replies: ${error.message}`;
        }
    }


    /* =====================================================
       TICKET BUTTON ACTIONS
    ===================================================== */

    document.addEventListener("click", async event => {

        const replyButton = event.target.closest("[data-load-replies]");

        if (replyButton) {
            const ticketId = replyButton.dataset.loadReplies;

            const container = document.getElementById(
                `ticket-replies-${ticketId}`
            );

            if (container) {
                await loadReplies(ticketId, container);
            }

            return;
        }

        const statusButton = event.target.closest("[data-ticket-status]");

        if (statusButton) {
            if (!isStaff()) return;

            const ticketId = statusButton.dataset.ticketStatus;
            const nextStatus = statusButton.dataset.nextStatus;

            const confirmed = confirm(
                `Are you sure you want to ${nextStatus} this ticket?`
            );

            if (!confirmed) return;

            statusButton.disabled = true;

            try {
                await apiRequest(API.ticketStatus, {
                    method: "PATCH",
                    body: JSON.stringify({
                        ticket_id: ticketId,
                        status: nextStatus
                    })
                });

                await loadTickets();

            } catch (error) {
                alert(error.message || "Could not update ticket.");
                statusButton.disabled = false;
            }
        }
    });


    /* =====================================================
       SEND TICKET REPLY
    ===================================================== */

    document.addEventListener("submit", async event => {
        const form = event.target.closest(".ticket-reply-form");

        if (!form) return;

        event.preventDefault();

        const ticketId = form.dataset.replyTicket;
        const textarea = $('textarea[name="message"]', form);
        const button = $('button[type="submit"]', form);
        const messageElement = $(".reply-message", form);

        const message = textarea?.value.trim();

        if (!message) {
            showMessage(messageElement, "Enter a reply first.");
            return;
        }

        setLoading(button, true, "Sending...");

        try {
            await apiRequest(API.ticketReplies, {
                method: "POST",
                body: JSON.stringify({
                    ticket_id: ticketId,
                    message
                })
            });

            textarea.value = "";

            showMessage(messageElement, "Reply sent successfully.", true);

            const container = document.getElementById(
                `ticket-replies-${ticketId}`
            );

            await loadReplies(ticketId, container);

        } catch (error) {
            showMessage(
                messageElement,
                error.message || "Could not send reply."
            );
        } finally {
            setLoading(button, false);
        }
    });


    /* =====================================================
       INITIAL STARTUP
    ===================================================== */

    restoreSession();

});
