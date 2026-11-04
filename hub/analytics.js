// Google Analytics (GA4) for the hub. Change GA_ID here to switch the property.
// Page views plus a "select_content" event whenever a product card is clicked.
(function () {
  var GA_ID = 'G-RH8SN9RQ8M';
  if (!GA_ID) return;

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', GA_ID, {
    page_title: 'Hub',
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.card');
    if (!a) return;
    var h2 = a.querySelector('h2');
    gtag('event', 'select_content', {
      content_type: 'product',
      item_id: h2 ? h2.textContent.trim() : a.getAttribute('href'),
      link_url: a.href,
      transport_type: 'beacon'
    });
  });
})();
