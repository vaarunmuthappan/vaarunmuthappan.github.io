document.addEventListener("DOMContentLoaded", function () {
    const navLinks = document.querySelectorAll(".nav-tabs a");

    navLinks.forEach(link => {
        link.addEventListener("click", function (event) {
            event.preventDefault();
            const targetPage = this.getAttribute("href");
            window.location.href = targetPage;
        });
    });
});