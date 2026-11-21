
document.addEventListener("DOMContentLoaded", () => {
    let currentUser = null;
    let tickets = [];
    let pendingSignupEmail = "";

    const $ = id => document.getElementById(id);

    // ---------- HELPERS ----------

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[char]));
    }

    function isStaff() {
        return ["owner", "admin", "staff"].includes(
            String(currentUser?.role || "").toLowerCase()
        );
    }

    function normalizeUser(user) {
        if (!user) return null;

        return {
            ...user,
            username: user.username || "User",
            role: String(user.role || "member").toLowerCase()
        };
    }

    function showMessage(element, message, success = false) {
        if (!element) return;
        element.textContent = message;
        element.style.color = success ? "#22c55e" : "#ef4444";
    }

    function formatDate(value) {
        if (!value) return "Unknown";

        const date = new Date(
            String(value).includes("T")
                ? value
                : String(value).replace(" ", "T") + "Z"
        );

        return isNaN(date.getTime())
            ? value
            : date.toLocaleString();
    }

    async function api(url, options = {}) {
        const response = await fetch(url, {
            credentials: "same-origin",
            ...options,
            headers: {
                ...(options.body
                    ? { "Content-Type": "application/json" }
                    : {}),
                ...(options.headers || {})
            }
        });

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error("Invalid server response.");
        }

        if (!response.ok) {
            throw new Error(
                data.error || data.message || "Request failed."
            );
        }

        return data;
    }

    // ---------- AUTHENTICATION SCREENS ----------

    function showAuthForm(formName) {
        ["loginForm", "signupForm", "verifyForm"].forEach(id => {
            if ($(id)) {
                $(id).style.display = id === formName ? "block" : "none";
            }
        });

        if ($("loginMessage")) $("loginMessage").textContent = "";
        if ($("signupMessage")) $("signupMessage").textContent = "";
        if ($("verifyMessage")) $("verifyMessage").textContent = "";
    }

    $("showSignupBtn")?.addEventListener("click", () => {
        showAuthForm("signupForm");
    });

    $("showLoginBtn")?.addEventListener("click", () => {
        showAuthForm("loginForm");
    });

    function showLogin() {
        if ($("loginPage")) {
            $("loginPage").style.display = "flex";
        }

        if ($("dashboard")) {
            $("dashboard").classList.add("hidden");
            $("dashboard").style.display = "none";
        }

        showAuthForm("loginForm");
    }

    function showDashboard() {
        if ($("loginPage")) {
            $("loginPage").style.display = "none";
        }

        if ($("dashboard")) {
            $("dashboard").classList.remove("hidden");
            $("dashboard").style.display = "flex";
        }

        updateUserDetails();
        updatePermissions();
        navigateTo("overview");
        updateDashboard();
    }

    // ---------- SIGNUP: SEND EMAIL CODE ----------

    $("signupForm")?.addEventListener("submit", async event => {
        event.preventDefault();

        const username = $("signupUsername")?.value.trim();
        const email = $("signupEmail")?.value.trim().toLowerCase();
        const password = $("signupPassword")?.value;

        if (!username || !email || !password) {
            showMessage(
                $("signupMessage"),
                "Please fill in all fields."
            );
            return;
        }

        if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
            showMessage(
                $("signupMessage"),
                "Username must be 3–30 letters, numbers or underscores."
            );
            return;
        }

        if (password.length < 12) {
            showMessage(
                $("signupMessage"),
                "Password must be at least 12 characters."
            );
            return;
        }

        const button = $("signupForm").querySelector(
            'button[type="submit"]'
        );

        if (button) button.disabled = true;

        showMessage(
            $("signupMessage"),
            "Sending verification email...",
            true
        );

        try {
            const result = await api("/api/send-verification", {
                method: "POST",
                body: JSON.stringify({
                    username,
                    email,
                    password
                })
            });

            pendingSignupEmail = email;

            showAuthForm("verifyForm");

            showMessage(
                $("verifyMessage"),
                result.message || "Verification code sent. Check your email.",
                true
            );

        } catch (error) {
            showMessage($("signupMessage"), error.message);
        } finally {
            if (button) button.disabled = false;
        }
    });

    // ---------- VERIFY EMAIL AND CREATE ACCOUNT ----------

    $("verifyForm")?.addEventListener("submit", async event => {
        event.preventDefault();

        const code = $("verificationCode")?.value.trim();

        if (!pendingSignupEmail) {
            showMessage(
                $("verifyMessage"),
                "Please start signup again."
            );
            showAuthForm("signupForm");
            return;
        }

        if (!/^\d{6}$/.test(code)) {
            showMessage(
                $("verifyMessage"),
                "Enter a valid six-digit code."
            );
            return;
        }

        const button = $("verifyForm").querySelector(
            'button[type="submit"]'
        );

        if (button) button.disabled = true;

        showMessage(
            $("verifyMessage"),
            "Verifying your email...",
            true
        );

        try {
            const result = await api("/api/verify-signup", {
                method: "POST",
                body: JSON.stringify({
                    email: pendingSignupEmail,
                    code
                })
            });

            pendingSignupEmail = "";

            $("verifyForm").reset();
            $("signupForm").reset();

            showAuthForm("loginForm");

            showMessage(
                $("loginMessage"),
                result.message || "Account created! You can now log in.",
                true
            );

        } catch (error) {
            showMessage($("verifyMessage"), error.message);
        } finally {
            if (button) button.disabled = false;
        }
    });

    // ---------- LOGIN ----------

    $("loginForm")?.addEventListener("submit", async event => {
        event.preventDefault();

        const email = $("loginEmail")?.value.trim();
        const password = $("loginPassword")?.value;

        if (!email || !password) {
            showMessage(
                $("loginMessage"),
                "Please enter your email and password."
            );
            return;
        }

        const button = $("loginForm").querySelector(
            'button[type="submit"]'
        );

        if (button) button.disabled = true;

        showMessage($("loginMessage"), "Logging in...", true);

        try {
            const result = await api("/api/login", {
                method: "POST",
                body: JSON.stringify({ email, password })
            });

            currentUser = normalizeUser(result.user || result);

            if (!currentUser || !currentUser.id) {
                throw new Error("User information missing from login response.");
            }

            $("loginPassword").value = "";

            showDashboard();
            await loadTickets();

        } catch (error) {
            currentUser = null;
            showMessage($("loginMessage"), error.message);
            console.error("Login error:", error);
        } finally {
            if (button) button.disabled = false;
        }
    });

    // ---------- LOGOUT ----------

    $("logoutBtn")?.addEventListener("click", async () => {
        try {
            await api("/api/logout", { method: "POST" });
        } catch (error) {
            console.error("Logout error:", error);
        }

        currentUser = null;
        tickets = [];
        showLogin();
    });

    // ---------- RESTORE SESSION ----------

    async function restoreSession() {
        try {
            const result = await api("/api/me");

            currentUser = normalizeUser(result.user || result);

            if (!currentUser || !currentUser.id) {
                throw new Error("No active session.");
            }

            showDashboard();
            await loadTickets();

        } catch {
            currentUser = null;
            showLogin();
        }
    }

    // ---------- PROFILE LOGO ----------

    function loadProfileLogo() {
        if (!currentUser) return;

        const savedLogo = localStorage.getItem(
            "astrix_logo_" + currentUser.id
        );

        ["userAvatar", "accountAvatar"].forEach(id => {
            const avatar = $(id);
            if (!avatar) return;

            if (savedLogo) {
                avatar.innerHTML = "";
                avatar.style.backgroundImage = `url("${savedLogo}")`;
                avatar.style.backgroundSize = "cover";
                avatar.style.backgroundPosition = "center";
            } else {
                avatar.style.backgroundImage = "none";
                avatar.textContent =
                    currentUser.username.charAt(0).toUpperCase();
            }
        });
    }

    $("accountLogoInput")?.addEventListener("change", event => {
        const file = event.target.files?.[0];

        if (!file || !currentUser) return;

        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
            showMessage(
                $("logoMessage"),
                "Please choose a PNG, JPG or WEBP image."
            );
            return;
        }

        if (file.size > 1024 * 1024) {
            showMessage(
                $("logoMessage"),
                "Image must be smaller than 1 MB."
            );
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            try {
                localStorage.setItem(
                    "astrix_logo_" + currentUser.id,
                    reader.result
                );

                loadProfileLogo();

                showMessage(
                    $("logoMessage"),
                    "Profile logo updated successfully!",
                    true
                );
            } catch {
                showMessage(
                    $("logoMessage"),
                    "Could not save the image. Try a smaller image."
                );
            }
        };

        reader.readAsDataURL(file);
    });

    // ---------- USER DETAILS ----------

    function updateUserDetails() {
        if (!currentUser) return;

        const username = currentUser.username;
        const initial = username.charAt(0).toUpperCase();

        if ($("sidebarUserName")) {
            $("sidebarUserName").textContent = username;
        }

        if ($("sidebarUserRole")) {
            $("sidebarUserRole").textContent = currentUser.role;
        }

        if ($("topbarUserName")) {
            $("topbarUserName").textContent = username;
        }

        if ($("accountName")) {
            $("accountName").textContent = username;
        }

        if ($("accountEmail")) {
            $("accountEmail").textContent = currentUser.email || "";
        }

        if ($("accountRole")) {
            $("accountRole").textContent = currentUser.role;
        }

        if ($("userAvatar")) {
            $("userAvatar").textContent = initial;
        }

        if ($("accountAvatar")) {
            $("accountAvatar").textContent = initial;
        }

        loadProfileLogo();
    }

    // ---------- PERMISSIONS ----------

    function updatePermissions() {
        const restricted = [
            "create-server",
            "manage-users",
            "all-servers",
            "manage-tickets"
        ];

        document.querySelectorAll("[data-page]").forEach(link => {
            if (restricted.includes(link.dataset.page)) {
                link.style.display = isStaff() ? "" : "none";
            }
        });

        if ($("adminNavigation")) {
            $("adminNavigation").style.display =
                isStaff() ? "" : "none";
        }
    }

    // ---------- NAVIGATION ----------

    function navigateTo(page) {
        if (!page) return;

        const restricted = [
            "create-server",
            "manage-users",
            "all-servers",
            "manage-tickets"
        ];

        if (restricted.includes(page) && !isStaff()) {
            page = "overview";
        }

        document.querySelectorAll(".page").forEach(section => {
            section.classList.remove("active");
            section.style.display = "none";
        });

        const target = $("page-" + page);

        if (target) {
            target.classList.add("active");
            target.style.display = "block";
        }

        document.querySelectorAll("[data-page]").forEach(link => {
            link.classList.toggle(
                "active",
                link.dataset.page === page
            );
        });

        const activeLink = document.querySelector(
            `[data-page="${page}"]`
        );

        if ($("pageTitle")) {
            $("pageTitle").textContent =
                activeLink
                    ? activeLink.textContent.trim()
                    : "ASTRIX CLOUD";
        }

        if (page.includes("ticket")) loadTickets();

        if (page === "overview") updateDashboard();

        if (page.includes("server")) showServerNotice();

        if (page === "manage-users") showUsersNotice();

        $("sidebar")?.classList.remove("open");
    }

    document.querySelectorAll("[data-page]").forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();
            navigateTo(link.dataset.page);
        });
    });

    $("menuToggle")?.addEventListener("click", () => {
        $("sidebar")?.classList.toggle("open");
    });

    // ---------- SERVER STATUS ----------

    function showServerNotice() {
        const message =
            "Server management is not connected yet. A hosting node and server API are required.";

        ["myServersList", "allServersList", "recentServers"].forEach(id => {
            if ($(id)) $(id).textContent = message;
        });

        ["totalServers", "onlineServers", "offlineServers"].forEach(id => {
            if ($(id)) $(id).textContent = "—";
        });
    }

    $("createServerForm")?.addEventListener("submit", event => {
        event.preventDefault();

        showMessage(
            $("createServerMessage"),
            "Server creation is unavailable until a real hosting node and server API are connected."
        );
    });

    // ---------- TICKETS ----------

    async function loadTickets() {
        if (!currentUser) return;

        try {
            const result = await api("/api/tickets");

            tickets = Array.isArray(result)
                ? result
                : (result.tickets || result.data || []);

            renderTickets();
            updateDashboard();

        } catch (error) {
            console.error("Ticket loading failed:", error);

            if ($("myTicketsList")) {
                $("myTicketsList").textContent =
                    "Could not load tickets: " + error.message;
            }

            if ($("adminTicketsList")) {
                $("adminTicketsList").textContent =
                    "Could not load tickets: " + error.message;
            }
        }
    }

    function ticketHTML(ticket) {
        const id = Number(ticket.id);
        const status = String(ticket.status || "open").toLowerCase();

        return `
            <div class="ticket-card" data-ticket-id="${id}">
                <h3>${escapeHTML(ticket.subject)}</h3>

                <p><strong>Ticket #${id}</strong></p>

                <p>
                    Category:
                    ${escapeHTML(ticket.category || "General")}
                </p>

                ${isStaff() ? `
                    <p>Member: ${escapeHTML(
                        ticket.username || ticket.email || "Member"
                    )}</p>
                ` : ""}

                <p>${escapeHTML(ticket.description || "")}</p>

                <p>
                    Status:
                    <strong>${escapeHTML(status.toUpperCase())}</strong>
                </p>

                <p>Created: ${escapeHTML(formatDate(ticket.created_at))}</p>

                <button type="button" data-open-replies="${id}">
                    View / Reply
                </button>

                ${isStaff() ? `
                    <button
                        type="button"
                        data-ticket-status="${id}"
                        data-status="${status === "closed" ? "open" : "closed"}"
                    >
                        ${status === "closed" ? "Reopen Ticket" : "Close Ticket"}
                    </button>
                ` : ""}

                <div
                    id="replies-${id}"
                    class="ticket-replies"
                    style="display:none;"
                >
                    <div class="reply-list">Loading replies...</div>

                    <form data-reply-form="${id}">
                        <textarea
                            name="message"
                            placeholder="Write your reply..."
                            required
                        ></textarea>

                        <button type="submit">Send Reply</button>
                    </form>
                </div>
            </div>
        `;
    }

    function renderTickets() {
        if (!currentUser) return;

        const myTickets = tickets.filter(ticket =>
            Number(ticket.user_id) === Number(currentUser.id)
        );

        if ($("myTicketsList")) {
            $("myTicketsList").innerHTML = myTickets.length
                ? myTickets.map(ticketHTML).join("")
                : "<p>You have not created any support tickets yet.</p>";
        }

        if ($("adminTicketsList") && isStaff()) {
            $("adminTicketsList").innerHTML = tickets.length
                ? tickets.map(ticketHTML).join("")
                : "<p>No support tickets found.</p>";
        }
    }

    // ---------- CREATE TICKET ----------

    $("ticketForm")?.addEventListener("submit", async event => {
        event.preventDefault();

        const subject = $("ticketSubject")?.value.trim();
        const category = $("ticketCategory")?.value;
        const description = $("ticketDescription")?.value.trim();

        if (!subject || !description) {
            alert("Please fill in the subject and description.");
            return;
        }

        try {
            await api("/api/tickets", {
                method: "POST",
                body: JSON.stringify({
                    subject,
                    category,
                    description
                })
            });

            $("ticketForm").reset();

            alert("Support ticket created successfully.");

            await loadTickets();

        } catch (error) {
            alert("Could not create ticket: " + error.message);
        }
    });

    // ---------- LOAD REPLIES ----------

    async function loadReplies(ticketId) {
        const container = $("replies-" + ticketId);
        const list = container?.querySelector(".reply-list");

        if (!list) return;

        list.textContent = "Loading replies...";

        try {
            const result = await api(
                "/api/ticket-replies?ticket_id=" +
                encodeURIComponent(ticketId)
            );

            const replies = Array.isArray(result)
                ? result
                : (result.replies || result.data || []);

            list.innerHTML = replies.length
                ? replies.map(reply => `
                    <div class="ticket-reply">
                        <strong>
                            ${escapeHTML(
                                reply.username ||
                                reply.sender_name ||
                                "User"
                            )}
                        </strong>

                        <p>${escapeHTML(reply.message)}</p>

                        <small>
                            ${escapeHTML(formatDate(reply.created_at))}
                        </small>
                    </div>
                `).join("")
                : "<p>No replies yet.</p>";

        } catch (error) {
            list.textContent =
                "Could not load replies: " + error.message;
        }
    }

    // ---------- TICKET BUTTONS ----------

    document.addEventListener("click", async event => {
        const replyButton = event.target.closest(
            "[data-open-replies]"
        );

        if (replyButton) {
            const id = replyButton.dataset.openReplies;
            const container = $("replies-" + id);

            if (container) {
                const opening = container.style.display === "none";

                container.style.display = opening ? "block" : "none";

                if (opening) await loadReplies(id);
            }
        }

        const statusButton = event.target.closest(
            "[data-ticket-status]"
        );

        if (statusButton) {
            try {
                await api("/api/ticket-status", {
                    method: "PATCH",
                    body: JSON.stringify({
                        ticket_id: Number(
                            statusButton.dataset.ticketStatus
                        ),
                        status: statusButton.dataset.status
                    })
                });

                await loadTickets();

            } catch (error) {
                alert("Could not update ticket: " + error.message);
            }
        }
    });

    // ---------- SEND REPLY ----------

    document.addEventListener("submit", async event => {
        const form = event.target.closest("[data-reply-form]");

        if (!form) return;

        event.preventDefault();

        const ticketId = Number(form.dataset.replyForm);

        const message = form.querySelector(
            '[name="message"]'
        )?.value.trim();

        if (!message) return;

        const button = form.querySelector(
            'button[type="submit"]'
        );

        if (button) button.disabled = true;

        try {
            await api("/api/ticket-replies", {
                method: "POST",
                body: JSON.stringify({
                    ticket_id: ticketId,
                    message
                })
            });

            form.reset();

            await loadReplies(ticketId);

        } catch (error) {
            alert("Could not send reply: " + error.message);
        } finally {
            if (button) button.disabled = false;
        }
    });

    // ---------- USER MANAGEMENT ----------

    function showUsersNotice() {
        if ($("usersList")) {
            $("usersList").textContent =
                "User management is not connected yet.";
        }
    }

    // ---------- DASHBOARD ----------

    function updateDashboard() {
        if (!currentUser) return;

        const mine = tickets.filter(ticket =>
            Number(ticket.user_id) === Number(currentUser.id)
        );

        if ($("totalTickets")) {
            $("totalTickets").textContent = isStaff()
                ? tickets.length
                : mine.length;
        }

        showServerNotice();
    }

    // ---------- START ----------

    showLogin();
    restoreSession();
});
