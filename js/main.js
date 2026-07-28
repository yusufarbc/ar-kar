(function ($) {
    "use strict";
    
    // Dropdown on mouse hover
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


    // Date and time picker
    $('.date').datetimepicker({
        format: 'L'
    });
    $('.time').datetimepicker({
        format: 'LT'
    });
    
    
    // Back to top button
    $(window).scroll(function () {
        if ($(this).scrollTop() > 100) {
            $('.back-to-top').fadeIn('slow');
        } else {
            $('.back-to-top').fadeOut('slow');
        }
    });
    $('.back-to-top').click(function () {
        $('html, body').animate({scrollTop: 0}, 1500, 'easeInOutExpo');
        return false;
    });


    // Portfolio isotope and filter
    var portfolioIsotope = $('.portfolio-container').isotope({
        itemSelector: '.portfolio-item',
        layoutMode: 'fitRows'
    });
    $('#portfolio-flters li').on('click', function () {
        $("#portfolio-flters li").removeClass('active');
        $(this).addClass('active');

        portfolioIsotope.isotope({filter: $(this).data('filter')});
    });


    // Testimonials carousel
    $(".testimonial-carousel").owlCarousel({
        autoplay: true,
        smartSpeed: 1000,
        items: 1,
        dots: false,
        loop: true,
    });
    
    // Sayfa Açılış Reklam Popup (bmt-reklam.webp)
    function initAdPopup() {
        if ($('#adPopup').length === 0) {
            var popupHtml = `
                <div id="adPopup" class="ad-popup-overlay" role="dialog" aria-modal="true" aria-label="AR-KAR Reklam">
                    <div class="ad-popup-wrapper">
                        <button type="button" class="ad-popup-close" id="adPopupClose" aria-label="Kapat">&times;</button>
                        <div class="ad-popup-body">
                            <img src="img/bmt-reklam.webp" alt="AR-KAR Reklam Duyurusu" class="ad-popup-img">
                        </div>
                    </div>
                </div>
            `;
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
            $popup.removeClass('show');
            setTimeout(function () {
                $popup.css('display', 'none');
                $('body').removeClass('ad-popup-open');
            }, 350);
        }

        // Sayfa açıldıktan sonra yumuşak gecikme ile göster
        setTimeout(openPopup, 400);

        // Kapatma Olayları
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

