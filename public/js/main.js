(function ($) {
    "use strict";

    /* ----------------------------------------------------------------------
       NOT: Bu dosya eskiden hazır şablonun orijinaliydi ve sitede hiç
       bulunmayan öğeleri hedefleyen kod içeriyordu:

         .date / .time      -> tempusdominus datetimepicker (hiç yok)
         .testimonial-carousel -> owlCarousel (hiç yok)
         .back-to-top       -> easing eklentisi (hiç yok)
         #portfolio-flters  -> isotope filtreleme arayüzü (hiç yok)

       Bu yüzden her sayfada moment.js, moment-timezone, tempusdominus,
       owlCarousel, isotope, easing ve waypoints (~900 KB) hiçbir işe
       yaramadan yükleniyordu. Hepsi kaldırıldı; geriye yalnızca gerçekten
       çalışan iki davranış kaldı.
       ---------------------------------------------------------------------- */

    // ----------------------------------------------------------------------
    // Masaüstünde açılır menüyü fare üzerine gelince aç
    // ----------------------------------------------------------------------
    $(document).ready(function () {
        function toggleNavbarMethod() {
            if ($(window).width() > 992) {
                $('.navbar .dropdown').on('mouseover', function () {
                    $('.dropdown-toggle', this).trigger('click');
                }).on('mouseout', function () {
                    $('.dropdown-toggle', this).trigger('click').blur();
                });
            } else {
                $('.navbar .dropdown').off('mouseover').off('mouseout');
            }
        }
        toggleNavbarMethod();
        $(window).resize(toggleNavbarMethod);
    });

    // ----------------------------------------------------------------------
    // Açılış duyuru penceresi (bmt-reklam.webp)
    //
    // Eskiden her sayfa açılışında yeniden gösteriliyordu; aynı ziyaretçi
    // siteyi gezerken duyuruyu her sayfada tekrar kapatmak zorunda kalıyordu.
    // Artık oturum başına bir kez gösterilir.
    // ----------------------------------------------------------------------
    var AD_KEY = 'arkar:ad-dismissed';

    function adAlreadySeen() {
        try {
            return sessionStorage.getItem(AD_KEY) === '1';
        } catch (e) {
            // Gizli sekme veya site verisi kapalıysa sessionStorage erişimi
            // hata fırlatabilir; bu durumda duyuruyu göstermeye devam et.
            return false;
        }
    }

    function rememberAdSeen() {
        try {
            sessionStorage.setItem(AD_KEY, '1');
        } catch (e) {
            /* yok sayılır */
        }
    }

    function initAdPopup() {
        if (adAlreadySeen()) return;

        if ($('#adPopup').length === 0) {
            var popupHtml =
                '<div id="adPopup" class="ad-popup-overlay" role="dialog" aria-modal="true" aria-label="AR-KAR Duyuru">' +
                '  <div class="ad-popup-wrapper">' +
                '    <button type="button" class="ad-popup-close" id="adPopupClose" aria-label="Kapat">&times;</button>' +
                '    <div class="ad-popup-body">' +
                '      <img src="/img/bmt-reklam.webp" alt="AR-KAR duyurusu" class="ad-popup-img" width="800" height="1000">' +
                '    </div>' +
                '  </div>' +
                '</div>';
            $('body').append(popupHtml);
        }

        var $popup = $('#adPopup');

        function openPopup() {
            $('body').addClass('ad-popup-open');
            $popup.css('display', 'flex');
            setTimeout(function () {
                $popup.addClass('show');
            }, 50);
        }

        function closePopup() {
            rememberAdSeen();
            $popup.removeClass('show');
            setTimeout(function () {
                $popup.css('display', 'none');
                $('body').removeClass('ad-popup-open');
            }, 350);
        }

        setTimeout(openPopup, 400);

        $(document).on('click', '#adPopupClose', function (e) {
            e.preventDefault();
            closePopup();
        });

        $(document).on('click', '#adPopup', function (e) {
            if ($(e.target).hasClass('ad-popup-overlay') || $(e.target).hasClass('ad-popup-wrapper')) {
                closePopup();
            }
        });

        $(document).on('keyup', function (e) {
            if (e.key === 'Escape' || e.keyCode === 27) {
                closePopup();
            }
        });
    }

    $(document).ready(function () {
        initAdPopup();
    });

})(jQuery);
