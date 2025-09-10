const CONSENT_KEY = "consentGranted";
const consentStatus = localStorage.getItem(CONSENT_KEY);

function gtag() {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(arguments);
}

function updateConsent(granted) {
  gtag('consent', 'update', {
    ad_user_data: granted ? 'granted' : 'denied',
    ad_personalization: granted ? 'granted' : 'denied',
    ad_storage: granted ? 'granted' : 'denied',
    analytics_storage: granted ? 'granted' : 'denied'
  });
}

function hideBanner() {
  const banner = document.getElementById("consent-banner");
  if (banner) banner.style.display = "none";
}

function showBanner() {
  const banner = document.getElementById("consent-banner");
  if (banner) banner.style.display = "block";
}

function initConsent() {
  if (consentStatus === "true") {
    updateConsent(true);
  } else if (consentStatus === "false") {
    updateConsent(false);
  } else {
    showBanner();

    document.getElementById("grantButton").addEventListener("click", () => {
      localStorage.setItem(CONSENT_KEY, "true");
      updateConsent(true);
      hideBanner();
    });

    document.getElementById("declineButton").addEventListener("click", () => {
      localStorage.setItem(CONSENT_KEY, "false");
      updateConsent(false);
      hideBanner();
    });
  }
}

document.addEventListener("DOMContentLoaded", initConsent);
