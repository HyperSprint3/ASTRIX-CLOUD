
document.addEventListener("DOMContentLoaded", () => {
    let currentUser = null;
    let tickets = [];

    const $ = id => document.getElementById(id);

    // ---------- SECURITY HELPERS ----------

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

    function formatDate(value) {
        if (!value) return "Unknown";
        const date = new Date(value.replace(" ", "T") + "Z");
        return isNaN(date.getTime()) ? value : date.toLocaleString();
    }

    async function api(url, options = {}) {
        const response = await fetch(url, {
            credentials: "same-origin",
            ...options,
            headers: {
                ...(options.body ? { "Content-Type": "application/json" } : {}),
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
            throw new Error(data.error || data.message || "Request failed.");
        }

        return data;
    }

    function showMessage(element, message, success = false) {
        if (!element) return;
        element.textContent = message;
        element.style.color = success ? "#22c55e" : "#ef4444";
    }

    function normalizeUser(user) {
        if (!user) return null;
        return {
            ...user,
            username: user.username || "User",
            role: String(user.role || "member").toLowerCase()
        };
    }

    // ---------- PAGE VISIBILITY ----------

    function showLogin() {
        if ($("loginPage")) $("loginPage").style.display = "flex";
        if ($("dashboard")) $("dashboard").style.display = "none";
    }

    
function showDashboard() {
    if ($("loginPage")) $("loginPage").style.display = "none";

    if ($("dashboard")) {
        $("dashboard").classList.remove("hidden");
        $("dashboard").style.display = "flex";
    }

    updateUserDetails();
    updatePermissions();
    navigateTo("overview");
    updateDashboard();
}

        if ($("loginPage")) $("loginPage").style.display = "none";
        if ($("dashboard")) $("dashboard").style.display = "block";

        updateUserDetails();
        updatePermissions();
        navigateTo("overview");
        updateDashboard();
    }

    function updateUserDetails() {
        if (!currentUser) return;

        const username = currentUser.username;
        const initial = username.charAt(0).toUpperCase();

        if ($("sidebarUserName")) $("sidebarUserName").textContent = username;
        if ($("sidebarUserRole")) $("sidebarUserRole").textContent = currentUser.role;
        if ($("userAvatar")) $("userAvatar").textContent = initial;
        if ($("topbarUserName")) $("topbarUserName").textContent = username;
        if ($("accountAvatar")) $("accountAvatar").textContent = initial;
        if ($("accountName")) $("accountName").textContent = username;
        if ($("accountEmail")) $("accountEmail").textContent = currentUser.email;
        if ($("accountRole")) $("accountRole").textContent = currentUser.role;
    }

    function updatePermissions() {
        document.querySelectorAll("[data-page]").forEach(link => {
            const restricted = [
                "create-server",
                "manage-users",
                "all-servers",
                "manage-tickets"
            ];

            if (restricted.includes(link.dataset.page)) {
                link.style.display = isStaff() ? "" : "none";
            }
        });

        if ($("adminNavigation")) {
            $("adminNavigation").style.display = isStaff() ? "" : "none";
        }
    }

    // ---------- LOGIN ----------

    $("loginForm")?.addEventListener("submit", async event => {
        event.preventDefault();

        const email = $("loginEmail")?.value.trim();
        const password = $("loginPassword")?.value;

        showMessage($("loginMessage"), "Logging in...", true);

        try {
            const result = await api("/api/login", {
                method: "POST",
                body: JSON.stringify({ email, password })
            });

            currentUser = normalizeUser(result.user || result);

            if (!currentUser.id) {
                throw new Error("User information missing from login response.");
            }

            if ($("loginPassword")) $("loginPassword").value = "";

            showDashboard();
            await loadTickets();
        } catch (error) {
            showMessage($("loginMessage"), error.message);
        }
    });

    // ---------- LOGOUT ----------

    $("logoutBtn")?.addEventListener("click", async () => {
        try {
            await api("/api/logout", { method: "POST" });
        } catch (error) {
            console.error(error);
        }

        currentUser = null;
        tickets = [];
        showLogin();
    });

    // ---------- RESTORE LOGIN SESSION ----------

    async function restoreSession() {
        try {
            const result = await api("/api/me");
            currentUser = normalizeUser(result.user || result);

            if (!currentUser.id) throw new Error("No active session.");

            showDashboard();
            await loadTickets();
        } catch {
            currentUser = null;
            showLogin();
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
        link.classList.toggle("active", link.dataset.page === page);
    });

    const activeLink = document.querySelector(
        `[data-page="${page}"]`
    );

    if ($("pageTitle")) {
        $("pageTitle").textContent =
            activeLink ? activeLink.textContent.trim() : "ASTRIX CLOUD";
    }

    if (page.includes("ticket")) loadTickets();
    if (page === "overview") updateDashboard();
    if (page.includes("server")) showServerNotice();
    if (page === "manage-users") showUsersNotice();

    $("sidebar")?.classList.remove("open");
    $("sidebar")?.classList.remove("active");
}

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
            section.style.display = "none";
        });

        const target = $("page-" + page);
        if (target) target.style.display = "block";

        document.querySelectorAll("[data-page]").forEach(link => {
            link.classList.toggle("active", link.dataset.page === page);
        });

        const activeLink = document.querySelector(`[data-page="${page}"]`);

        if ($("pageTitle") && activeLink) {
            $("pageTitle").textContent = activeLink.textContent.trim();
        }

        if (page.includes("ticket")) loadTickets();
        if (page === "overview") updateDashboard();
        if (page.includes("server")) showServerNotice();
        if (page === "manage-users") showUsersNotice();

        $("sidebar")?.classList.remove("active");
    }

    document.querySelectorAll("[data-page]").forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();
            navigateTo(link.dataset.page);
        });
    });

    $("menuToggle")?.addEventListener("click", () => {
        $("sidebar")?.classList.toggle("active");
    });

    // ---------- REAL SERVER MANAGEMENT STATUS ----------

    function showServerNotice() {
        const message =
            "Server management is not connected yet. No demo servers are being displayed or created.";

        ["myServersList", "allServersList", "recentServers"].forEach(id => {
            if ($(id)) $(id).textContent = message;
        });

        if ($("totalServers")) $("totalServers").textContent = "—";
        if ($("onlineServers")) $("onlineServers").textContent = "—";
        if ($("offlineServers")) $("offlineServers").textContent = "—";
    }

    $("createServerForm")?.addEventListener("submit", event => {
        event.preventDefault();
        showMessage(
            $("createServerMessage"),
            "Server creation is unavailable until a real hosting node and server API are connected."
        );
    });

    // ---------- TICKETS: DATABASE ----------

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
                <p>Category: ${escapeHTML(ticket.category || "General")}</p>
                ${isStaff()
                    ? `<p>Member: ${escapeHTML(ticket.username || ticket.email || "Member")}</p>`
                    : ""}
                <p>${escapeHTML(ticket.description || "")}</p>
                <p>Status: <strong>${escapeHTML(status.toUpperCase())}</strong></p>
                <p>Created: ${escapeHTML(formatDate(ticket.created_at))}</p>

                <button type="button" data-open-replies="${id}">
                    View / Reply
                </button>

                ${isStaff() ? `
                    <button type="button"
                        data-ticket-status="${id}"
                        data-status="${status === "closed" ? "open" : "closed"}">
                        ${status === "closed" ? "Reopen Ticket" : "Close Ticket"}
                    </button>
                ` : ""}

                <div id="replies-${id}" class="ticket-replies" style="display:none;">
                    <div class="reply-list">Loading replies...</div>

                    <form data-reply-form="${id}">
                        <textarea name="message" placeholder="Write your reply..." required></textarea>
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
                body: JSON.stringify({ subject, category, description })
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
                "/api/ticket-replies?ticket_id=" + encodeURIComponent(ticketId)
            );

            const replies = Array.isArray(result)
                ? result
                : (result.replies || result.data || []);

            list.innerHTML = replies.length
                ? replies.map(reply => `
                    <div class="ticket-reply">
                        <strong>${escapeHTML(reply.username || reply.sender_name || "User")}</strong>
                        <p>${escapeHTML(reply.message)}</p>
                        <small>${escapeHTML(formatDate(reply.created_at))}</small>
                    </div>
                `).join("")
                : "<p>No replies yet.</p>";
        } catch (error) {
            list.textContent = "Could not load replies: " + error.message;
        }
    }

    // ---------- REPLY AND STATUS BUTTONS ----------

    document.addEventListener("click", async event => {
        const replyButton = event.target.closest("[data-open-replies]");

        if (replyButton) {
            const id = replyButton.dataset.openReplies;
            const container = $("replies-" + id);

            if (container) {
                const opening = container.style.display === "none";
                container.style.display = opening ? "block" : "none";

                if (opening) await loadReplies(id);
            }
        }

        const statusButton = event.target.closest("[data-ticket-status]");

        if (statusButton) {
            try {
                await api("/api/ticket-status", {
                    method: "PATCH",
                    body: JSON.stringify({
                        ticket_id: Number(statusButton.dataset.ticketStatus),
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
        const message = form.querySelector('[name="message"]')?.value.trim();

        if (!message) return;

        const button = form.querySelector('button[type="submit"]');
        if (button) button.disabled = true;

        try {
            await api("/api/ticket-replies", {
                method: "POST",
                body: JSON.stringify({ ticket_id: ticketId, message })
            });

            form.reset();
            await loadReplies(ticketId);
        } catch (error) {
            alert("Could not send reply: " + error.message);
        } finally {
            if (button) button.disabled = false;
        }
    });

    // ---------- USER MANAGEMENT STATUS ----------

    function showUsersNotice() {
        if ($("usersList")) {
            $("usersList").textContent =
                "User management is not connected yet. No fake users are displayed.";
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

    // ---------- START APPLICATION ----------

    restoreSession();
});
