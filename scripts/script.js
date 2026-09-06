// CarnegienFreedom.cc - Main JavaScript
const COOKIE_CONSENT_KEY = 'legitways_cookie_consent';
const EARLY_ACCESS_DISMISSED_KEY = 'legitways_early_access_dismissed';
let cookieConsentInitialized = false;

function initializeEarlyAccessBanner() {
    const banner = document.getElementById('earlyAccessBanner');
    const dismissButton = document.getElementById('dismissEarlyAccess');
    if (!banner || !dismissButton) return;

    try {
        if (localStorage.getItem(EARLY_ACCESS_DISMISSED_KEY) === 'true') {
            banner.hidden = true;
        }
    } catch (error) {
        // The banner remains available when storage is restricted.
    }

    dismissButton.addEventListener('click', () => {
        banner.hidden = true;
        try {
            localStorage.setItem(EARLY_ACCESS_DISMISSED_KEY, 'true');
        } catch (error) {
            // Dismissal still works for the current page when storage is restricted.
        }
    });
}

function ensureCookieConsentUI() {
    const existingBanner = document.getElementById('cookieBanner');
    const existingModal = document.getElementById('cookieModal');

    if (existingBanner && existingModal) {
        return;
    }

    if (!existingBanner) {
        const banner = document.createElement('div');
        banner.id = 'cookieBanner';
        banner.className = 'cookie-banner';
        banner.setAttribute('aria-live', 'polite');
        banner.setAttribute('aria-label', 'Cookie consent banner');
        banner.innerHTML = `
            <div class="cookie-banner__content">
                <div class="cookie-banner__text">
                    <h3>We use cookies</h3>
                    <p>
                        We use necessary cookies to keep the site operating and optional cookies for analytics and improved
                        experience. You can accept all, reject non-essential cookies, or choose your preferences.
                        <a href="privacy-policy.html" class="cookie-link">Privacy Policy</a>
                        <span> · </span>
                        <a href="cookie-policy.html" class="cookie-link">Cookie Policy</a>
                    </p>
                </div>
                <div class="cookie-banner__actions">
                    <button type="button" class="cookie-btn cookie-btn--legal" data-cookie-choice="reject">Reject all</button>
                    <button type="button" class="cookie-btn cookie-btn--secondary" data-cookie-choice="necessary">Only necessary</button>
                    <button type="button" class="cookie-btn cookie-btn--primary" data-cookie-choice="all">Accept all</button>
                    <button type="button" class="cookie-btn cookie-btn--ghost" id="manageCookiePrefs">Manage preferences</button>
                </div>
            </div>
        `;
        document.body.appendChild(banner);
    }

    if (!existingModal) {
        const modal = document.createElement('div');
        modal.id = 'cookieModal';
        modal.className = 'cookie-modal';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="cookie-modal__panel" role="dialog" aria-modal="true" aria-labelledby="cookiePreferencesTitle">
                <div class="cookie-modal__header">
                    <h3 id="cookiePreferencesTitle">Cookie preferences</h3>
                    <button type="button" class="cookie-close" id="closeCookieModal" aria-label="Close preferences">&times;</button>
                </div>

                <div class="cookie-preference">
                    <div>
                        <h4>Necessary cookies</h4>
                        <p>Required for the website to function securely and provide core features.</p>
                    </div>
                    <span class="cookie-state">Always on</span>
                </div>

                <div class="cookie-preference">
                    <div>
                        <h4>Analytics cookies</h4>
                        <p>Help us understand how visitors use the site so we can improve performance and content.</p>
                    </div>
                    <label class="cookie-switch">
                        <input type="checkbox" id="analyticsCookieToggle">
                        <span class="cookie-slider"></span>
                    </label>
                </div>

                <div class="cookie-preference">
                    <div>
                        <h4>Marketing cookies</h4>
                        <p>Used for relevant campaign tracking and promotional features, if enabled.</p>
                    </div>
                    <label class="cookie-switch">
                        <input type="checkbox" id="marketingCookieToggle">
                        <span class="cookie-slider"></span>
                    </label>
                </div>

                <div class="cookie-modal__footer">
                    <button type="button" class="cookie-btn cookie-btn--legal" data-cookie-choice="reject">Reject all</button>
                    <button type="button" class="cookie-btn cookie-btn--secondary" data-cookie-choice="necessary">Save only necessary</button>
                    <button type="button" class="cookie-btn cookie-btn--primary" data-cookie-choice="all">Save preferences</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

function getCookieConsent() {
    try {
        const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch (error) {
        return null;
    }
}

function hasAnalyticsConsent() {
    const consent = getCookieConsent();
    return Boolean(consent && consent.analytics === true);
}

function updateConsentTogglesFromStorage() {
    const analyticsToggle = document.getElementById('analyticsCookieToggle');
    const marketingToggle = document.getElementById('marketingCookieToggle');
    if (!analyticsToggle || !marketingToggle) return;

    const consent = getCookieConsent();
    if (!consent) {
        analyticsToggle.checked = false;
        marketingToggle.checked = false;
        return;
    }

    analyticsToggle.checked = Boolean(consent.analytics);
    marketingToggle.checked = Boolean(consent.marketing);
}

function applyConsentChoice(choice, options = {}) {
    const analyticsCookieEnabled = choice === 'reject'
        ? false
        : (options.analytics ?? choice === 'all');
    const marketingCookieEnabled = choice === 'reject'
        ? false
        : (options.marketing ?? choice === 'all');

    const consent = {
        choice,
        analytics: analyticsCookieEnabled,
        marketing: marketingCookieEnabled,
        timestamp: new Date().toISOString()
    };

    try {
        localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
    } catch (error) {
        console.warn('Cookie consent could not be saved:', error);
    }

    const banner = document.getElementById('cookieBanner');
    const modal = document.getElementById('cookieModal');
    if (banner) banner.classList.remove('visible');
    if (modal) modal.classList.remove('visible');
}

function openCookieModal() {
    const modal = document.getElementById('cookieModal');
    if (!modal) return;
    updateConsentTogglesFromStorage();
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');
}

function closeCookieModal() {
    const modal = document.getElementById('cookieModal');
    if (!modal) return;
    modal.classList.remove('visible');
    modal.setAttribute('aria-hidden', 'true');
}

function handleCookieChoiceClick(event) {
    const button = event.target.closest('[data-cookie-choice]');
    if (!button) return;

    const choice = button.dataset.cookieChoice;
    const analyticsToggle = document.getElementById('analyticsCookieToggle');
    const marketingToggle = document.getElementById('marketingCookieToggle');

    if (choice === 'all') {
        applyConsentChoice('all', { analytics: true, marketing: true });
        return;
    }

    if (choice === 'reject') {
        applyConsentChoice('reject', { analytics: false, marketing: false });
        return;
    }

    const analyticsEnabled = analyticsToggle ? analyticsToggle.checked : false;
    const marketingEnabled = marketingToggle ? marketingToggle.checked : false;
    applyConsentChoice('necessary', { analytics: analyticsEnabled, marketing: marketingEnabled });
}

function initializeCookieBanner() {
    if (cookieConsentInitialized) return;
    cookieConsentInitialized = true;

    ensureCookieConsentUI();

    const banner = document.getElementById('cookieBanner');
    const modal = document.getElementById('cookieModal');
    const analyticsToggle = document.getElementById('analyticsCookieToggle');
    const marketingToggle = document.getElementById('marketingCookieToggle');
    const consent = getCookieConsent();

    if (!consent) {
        banner?.classList.add('visible');
    } else {
        banner?.classList.remove('visible');
    }

    document.addEventListener('click', (event) => {
        const menuToggle = event.target.closest('.mobile-menu-toggle');
        if (menuToggle) {
            toggleMobileMenu();
            return;
        }

        const guideButton = event.target.closest('[data-guide-button]');
        if (guideButton) {
            event.preventDefault();
            if (guideButton.dataset.guideButton === 'mobile') toggleMobileMenu();
            downloadGuide(guideButton);
            return;
        }

        const mobileMenuLink = event.target.closest('#mobileMenu a');
        if (mobileMenuLink) {
            const mobileMenu = document.getElementById('mobileMenu');
            mobileMenu?.classList.remove('active');
        }

        const trigger = event.target.closest('[data-cookie-settings]');
        if (trigger) {
            event.preventDefault();
            openCookieModal();
            return;
        }

        if (event.target.closest('#manageCookiePrefs')) {
            event.preventDefault();
            openCookieModal();
            return;
        }

        if (event.target.closest('#closeCookieModal')) {
            closeCookieModal();
            return;
        }

        if (event.target === modal) {
            closeCookieModal();
            return;
        }

        handleCookieChoiceClick(event);
    });

    analyticsToggle.checked = Boolean(consent?.analytics);
    marketingToggle.checked = Boolean(consent?.marketing);
}

// Mobile Menu Toggle
function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    if (!menu) return;
    menu.classList.toggle('active');
}

const defaultTeamProfiles = [];

function renderTeamProfiles(profiles) {
    const grid = document.getElementById('teamProfilesGrid');
    if (!grid) return;

    grid.replaceChildren();
    profiles.forEach((profile) => {
        const card = document.createElement('article');
        card.className = 'team-card';

        const photo = document.createElement('div');
        photo.className = 'team-photo';
        photo.setAttribute('role', 'img');
        card.appendChild(photo);

        const body = document.createElement('div');
        body.className = 'team-card__body';
        const name = document.createElement('p');
        name.className = 'profile-placeholder';
        name.textContent = profile.name || 'Name placeholder';
        const role = document.createElement('p');
        role.className = 'profile-role';
        role.textContent = profile.role || 'Role or title';
        const bio = document.createElement('p');
        bio.className = 'profile-bio';
        bio.textContent = profile.bio || '';
        const linkedin = document.createElement('a');
        linkedin.className = 'linkedin-placeholder';
        linkedin.textContent = 'LinkedIn profile';
        linkedin.setAttribute('aria-label', 'LinkedIn profile');
        body.append(name, role, bio, linkedin);
        card.appendChild(body);
        grid.appendChild(card);

        if (profile.photo) {
            photo.style.backgroundImage = `url("${profile.photo.replace(/["\\)]/g, '')}")`;
            photo.setAttribute('aria-label', `Photo of ${profile.name || 'team member'}`);
        } else {
            photo.style.backgroundImage = '';
            photo.setAttribute('aria-label', 'Team member photo placeholder');
        }

        if (profile.linkedin) {
            linkedin.href = profile.linkedin;
            linkedin.target = '_blank';
            linkedin.rel = 'noopener noreferrer';
        } else {
            linkedin.hidden = true;
        }
    });
}

async function loadTeamProfiles() {
    if (!document.getElementById('teamProfilesGrid')) return;

    try {
        const response = await fetch('/api/settings/teamProfiles');
        const profiles = response.ok ? await response.json() : defaultTeamProfiles;
        renderTeamProfiles(Array.isArray(profiles) ? profiles : defaultTeamProfiles);
    } catch (error) {
        renderTeamProfiles(defaultTeamProfiles);
    }
}

// Hidden admin access: Ctrl+Shift+A on Windows/Linux, Cmd+Shift+A on macOS.
document.addEventListener('keydown', (event) => {
    const target = event.target;
    const isFormField = target instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

    if (!isFormField && event.shiftKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        window.location.href = 'admin.html';
    }
});

initializeCookieBanner();
initializeEarlyAccessBanner();
loadTeamProfiles();

// Smooth Scroll for Navigation Links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (!href || href === '#') {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        const target = document.querySelector(href);
        if (!target) return;

        e.preventDefault();
        const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        target.scrollIntoView({
            behavior: prefersReducedMotion ? 'auto' : 'smooth',
            block: 'start'
        });
    });
});

// Scroll Animations using Intersection Observer
if ('IntersectionObserver' in window) {
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    document.querySelectorAll('.fade-in').forEach(el => {
        observer.observe(el);
    });
}

function setGuideDownloadState(button, isLoading) {
    if (!button) return;

    if (isLoading) {
        button.dataset.originalText = button.dataset.originalText || button.textContent.trim();
        button.textContent = 'Downloading...';
        button.setAttribute('aria-busy', 'true');
        button.classList.add('is-loading');
        button.style.pointerEvents = 'none';
    } else {
        button.textContent = button.dataset.originalText || 'Download Guide';
        button.removeAttribute('aria-busy');
        button.classList.remove('is-loading');
        button.style.pointerEvents = '';
    }
}

function downloadGuide(triggerButton) {
    const fileUrl = 'assets/legit-ways-guide.pdf';
    if (triggerButton) {
        setGuideDownloadState(triggerButton, true);
    }

    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = 'legit-ways-guide.pdf';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
        if (triggerButton) {
            setGuideDownloadState(triggerButton, false);
        }
    }, 1200);
}

// Navbar Scroll Effect
const navbar = document.querySelector('.navbar');
if (navbar) {
    const updateNavbar = () => {
        const scrolled = window.scrollY > 50;
        navbar.style.background = scrolled ? 'rgba(7, 26, 61, 0.98)' : 'rgba(7, 26, 61, 0.95)';
        navbar.style.boxShadow = scrolled ? '0 2px 20px rgba(0,0,0,0.1)' : 'none';
    };

    let ticking = false;
    const onScroll = () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                updateNavbar();
                ticking = false;
            });
            ticking = true;
        }
    };

    updateNavbar();
    window.addEventListener('scroll', onScroll, { passive: true });
}

const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Privacy policy page interactions
const privacyScrollShell = document.querySelector('.privacy-scroll-shell');
const privacyMain = document.querySelector('.privacy-main');
const backToTop = document.getElementById('backToTop');
const privacySections = Array.from(document.querySelectorAll('.section'));
const privacyTocLinks = Array.from(document.querySelectorAll('.privacy-toc a'));

function updateScrollEffects() {
    if (backToTop) {
        backToTop.classList.toggle('visible', window.scrollY > 400);
    }

    if (privacyTocLinks.length > 0 && privacySections.length > 0) {
        let current = '';

        privacySections.forEach(section => {
            const sectionTop = section.offsetTop;
            if (window.scrollY >= sectionTop - 120) {
                current = section.getAttribute('id');
            }
        });

        privacyTocLinks.forEach(link => {
            const isActive = link.getAttribute('href') === '#' + current;
            link.classList.toggle('active', isActive);
        });
    }

    if (privacyScrollShell && privacyMain) {
        if (prefersReducedMotion) {
            privacyMain.style.transform = 'translateY(0px)';
            return;
        }

        const shellRect = privacyScrollShell.getBoundingClientRect();
        const viewportOffset = Math.max(0, -shellRect.top + 80);
        const maxViewportTravel = Math.max(0, window.innerHeight * 0.25);
        const translate = Math.min(viewportOffset * 0.55, maxViewportTravel);
        privacyMain.style.transform = `translateY(-${translate}px)`;
    }
}

let scrollFrame = null;
function scheduleScrollEffects() {
    if (scrollFrame !== null) return;

    scrollFrame = window.requestAnimationFrame(() => {
        updateScrollEffects();
        scrollFrame = null;
    });
}

window.addEventListener('scroll', scheduleScrollEffects, { passive: true });
window.addEventListener('resize', scheduleScrollEffects);
updateScrollEffects();

// Close mobile menu when clicking outside
document.addEventListener('click', (e) => {
    const mobileMenu = document.getElementById('mobileMenu');
    const menuToggle = document.querySelector('.mobile-menu-toggle');

    if (!mobileMenu || !menuToggle) return;

    if (mobileMenu.classList.contains('active') &&
        !mobileMenu.contains(e.target) &&
        !menuToggle.contains(e.target)) {
        mobileMenu.classList.remove('active');
    }
});

// Performance: Lazy load images (if adding more images later)
if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                    observer.unobserve(img);
                }
            }
        });
    });

    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
}

// Analytics placeholder (replace with your actual analytics)
function trackEvent(eventName, properties) {
    if (!hasAnalyticsConsent()) {
        return;
    }

    // Example: gtag('event', eventName, properties);
    // Example: fbq('track', eventName, properties);
    console.log('Event tracked:', eventName, properties);
}

// Track CTA clicks
document.querySelectorAll('.btn-primary, .btn-secondary, .nav-cta').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const text = btn.textContent.trim();
        trackEvent('cta_click', { button_text: text });
    });
});

if (backToTop) {
    backToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

if (privacyTocLinks.length > 0) {
    privacyTocLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const target = document.querySelector(link.getAttribute('href'));
            if (target) {
                const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
            }
        });
    });
}
