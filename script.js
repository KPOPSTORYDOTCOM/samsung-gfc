/**
 * 삼성생명 남산법인지점 GFC 기업재무컨설턴트 채용 랜딩페이지 스크립트 (index.html)
 * - Supabase DB 실시간 연동 (seminar_settings, seminar_schedules, applications)
 * - DB 미설정/오류 시 config.js 기본값 자동 Fallback
 * - 주민번호 앞 6자리(YYMMDD) 기반 GFC 위촉 가능 연령(67세 이하, 출생연도 기준) 실시간·제출 검증
 */

(function () {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const { client: supabaseClient, isConfigured } = window.createAppSupabaseClient
    ? window.createAppSupabaseClient()
    : { client: null, isConfigured: false };

  let currentSettings = Object.assign({}, cfg.DEFAULT_SEMINAR_SETTINGS);
  let activeSchedules = Array.isArray(cfg.DEFAULT_SEMINAR_SCHEDULES)
    ? cfg.DEFAULT_SEMINAR_SCHEDULES.slice()
    : [];

  /* ---------- Utilities ---------- */
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cleanDigits(str) {
    return String(str || '').replace(/[^0-9]/g, '');
  }

  function formatKoreanPhone(value) {
    const digits = cleanDigits(value).slice(0, 11);
    if (digits.startsWith('02')) {
      if (digits.length <= 2) return digits;
      if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
      if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
    }
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  }

  function formatScheduleLabel(item) {
    const parts = [item.round_name, item.event_date, item.event_time].filter(Boolean);
    return parts.join(' · ');
  }

  /* ---------- GFC 67세 연령 제한 (주민번호 앞 6자리 YYMMDD · 출생연도 기준) ---------- */
  function getGfcAgeRule() {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1; // 1~12
    const maxAge = Number(cfg.GFC_MAX_AGE) || 67;
    // 11~12월 접수·교육 후 위촉 시 다음 해 위촉 기준 적용 (예: 2026년 11~12월 -> 2027년 위촉 -> 1960년생까지)
    const appointmentYear = curMonth >= 11 ? curYear + 1 : curYear;
    const minBirthYear = Math.max(Number(cfg.GFC_MIN_BIRTH_YEAR) || 1960, appointmentYear - maxAge);
    const maxBirthYear = curYear - 19; // 법적 성인 기준
    return { appointmentYear, maxAge, minBirthYear, maxBirthYear, curYear };
  }

  function parseAndValidateBirth6(rawValue) {
    const digits = cleanDigits(rawValue);
    if (digits.length !== 6) {
      return {
        valid: false,
        reason: 'incomplete',
        message: '생년월일(주민번호 앞 6자리 숫자)을 정확히 입력해 주세요. (예: 650315)',
      };
    }

    const yy = parseInt(digits.slice(0, 2), 10);
    const mm = parseInt(digits.slice(2, 4), 10);
    const dd = parseInt(digits.slice(4, 6), 10);

    if (mm < 1 || mm > 12) {
      return {
        valid: false,
        reason: 'invalid_date',
        message: '올바른 출생월(01~12)을 입력해 주세요.',
      };
    }

    const rule = getGfcAgeRule();
    const curYY = rule.curYear % 100;
    const fullYear = yy <= curYY ? 2000 + yy : 1900 + yy;

    // 실제 달력에 존재하는 날짜인지 검증 (윤년 포함)
    const checkDate = new Date(fullYear, mm - 1, dd);
    if (
      checkDate.getFullYear() !== fullYear ||
      checkDate.getMonth() !== mm - 1 ||
      checkDate.getDate() !== dd
    ) {
      return {
        valid: false,
        reason: 'invalid_date',
        message: '존재하지 않는 생년월일입니다. 주민번호 앞 6자리를 다시 확인해 주세요.',
      };
    }

    // 생일(월·일) 무관, 출생연도만으로 67세 제한 판정
    if (fullYear < rule.minBirthYear) {
      return {
        valid: false,
        reason: 'too_old',
        fullYear,
        digits,
        message: `죄송합니다. GFC 위촉 가능 연령은 ${rule.maxAge}세 이하(${rule.appointmentYear}년 위촉 기준 ${rule.minBirthYear}년생까지)로 제한되어 있어 ${fullYear}년생은 신청이 어렵습니다.`,
      };
    }

    if (fullYear > rule.maxBirthYear) {
      return {
        valid: false,
        reason: 'too_young',
        fullYear,
        digits,
        message: `법적 성인(${rule.maxBirthYear}년생 이하)부터 지원 가능합니다.`,
      };
    }

    return {
      valid: true,
      fullYear,
      digits,
      formatted: `${digits} (${fullYear}년생)`,
      message: `${fullYear}년생 · GFC 지원 가능 (위촉 연령 ${rule.maxAge}세 이하 기준 충족)`,
    };
  }

  /* ---------- Modal Control ---------- */
  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('open');
    if (!document.querySelector('.modal-backdrop.open')) {
      document.body.style.overflow = '';
    }
  }

  function bindModals() {
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close-modal')));
    });

    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal(backdrop.id);
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.open').forEach((m) => closeModal(m.id));
      }
    });

    const openPrivacyBtn = document.getElementById('openPrivacyModalBtn');
    if (openPrivacyBtn) {
      openPrivacyBtn.addEventListener('click', () => openModal('privacyModal'));
    }

    const agreeCloseBtn = document.getElementById('agreeAndClosePrivacyBtn');
    if (agreeCloseBtn) {
      agreeCloseBtn.addEventListener('click', () => {
        const cb = document.getElementById('privacyAgree');
        if (cb) cb.checked = true;
        closeModal('privacyModal');
      });
    }
  }

  /* ---------- Header & Mobile Drawer ---------- */
  function bindNavigation() {
    const header = document.getElementById('siteHeader');
    const hamburger = document.getElementById('hamburgerBtn');
    const drawer = document.getElementById('mobileDrawer');

    window.addEventListener(
      'scroll',
      () => {
        if (!header) return;
        header.classList.toggle('scrolled', window.scrollY > 16);
      },
      { passive: true }
    );

    function setDrawer(open) {
      if (!hamburger || !drawer) return;
      hamburger.setAttribute('aria-expanded', String(open));
      drawer.setAttribute('aria-hidden', String(!open));
      drawer.classList.toggle('open', open);
    }

    if (hamburger && drawer) {
      hamburger.addEventListener('click', () => {
        const isOpen = drawer.classList.contains('open');
        setDrawer(!isOpen);
      });

      drawer.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => setDrawer(false));
      });
    }
  }

  /* ---------- FAQ Accordion ---------- */
  function bindFaqAccordion() {
    const items = document.querySelectorAll('#faqList .faq-item');
    items.forEach((item) => {
      const btn = item.querySelector('.faq-question');
      if (!btn) return;
      btn.addEventListener('click', () => {
        const willOpen = !item.classList.contains('open');
        items.forEach((other) => {
          other.classList.remove('open');
          const otherBtn = other.querySelector('.faq-question');
          if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
        });
        if (willOpen) {
          item.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  /* ---------- Render Seminar Settings & Schedules ---------- */
  function renderSeminarSettings(settings) {
    currentSettings = Object.assign({}, cfg.DEFAULT_SEMINAR_SETTINGS, settings || {});
    const telDigits = cleanDigits(currentSettings.manager_phone || '01045581663');
    const telHref = `tel:${telDigits}`;
    const formattedPhone = formatKoreanPhone(currentSettings.manager_phone || '010-4558-1663');

    const titleEl = document.getElementById('seminarTitle');
    const descEl = document.getElementById('seminarDescription');
    const locEl = document.getElementById('seminarLocation');
    const mgrDisplay = document.getElementById('seminarManagerDisplay');
    const phoneLink = document.getElementById('seminarPhoneLink');
    const footerMgr = document.getElementById('footerManagerName');
    const footerPhone = document.getElementById('footerManagerPhone');
    const floatingPhone = document.getElementById('floatingPhoneLink');
    const privacyCollector = document.getElementById('privacyCollector');
    const successPhoneBtn = document.getElementById('successPhoneBtn');

    if (titleEl) titleEl.textContent = currentSettings.title;
    if (descEl) descEl.textContent = currentSettings.description;
    if (locEl) locEl.textContent = currentSettings.location;
    if (mgrDisplay) mgrDisplay.textContent = `${currentSettings.manager_name} · ${formattedPhone}`;
    if (phoneLink) phoneLink.setAttribute('href', telHref);
    if (footerMgr) footerMgr.textContent = currentSettings.manager_name;
    if (footerPhone) {
      footerPhone.textContent = formattedPhone;
      footerPhone.setAttribute('href', telHref);
    }
    if (floatingPhone) floatingPhone.setAttribute('href', telHref);
    if (privacyCollector) {
      privacyCollector.textContent = `삼성생명 남산법인지점 / 담당: ${currentSettings.manager_name} (${formattedPhone})`;
    }
    if (successPhoneBtn) {
      successPhoneBtn.setAttribute('href', telHref);
      successPhoneBtn.textContent = `${currentSettings.manager_name}에게 바로 전화하기 (${formattedPhone})`;
    }
  }

  function renderSeminarSchedules(schedules) {
    const listEl = document.getElementById('seminarScheduleList');
    const selectEl = document.getElementById('applicantSchedule');

    const active = (Array.isArray(schedules) ? schedules : []).filter((s) => s.is_active !== false);
    activeSchedules = active;

    if (listEl) {
      if (active.length === 0) {
        listEl.innerHTML =
          '<div class="schedule-item"><span>현재 예정된 공개 일정이 없습니다. 1:1 개별 상담을 신청해 주세요.</span></div>';
      } else {
        listEl.innerHTML = active
          .map(
            (item) => `
          <div class="schedule-item">
            <div class="schedule-item-left">
              <span class="round-tag">${escapeHtml(item.round_name)}</span>
              <span class="schedule-date">${escapeHtml(item.event_date)}</span>
              <span class="schedule-time">${escapeHtml(item.event_time)}</span>
            </div>
            ${item.capacity ? `<span class="schedule-cap">선착순 ${escapeHtml(item.capacity)}명</span>` : ''}
          </div>
        `
          )
          .join('');
      }
    }

    if (selectEl) {
      const options = ['<option value="">희망 참석 일정을 선택해 주세요</option>'];
      active.forEach((item) => {
        const label = formatScheduleLabel(item);
        options.push(`<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`);
      });
      options.push('<option value="개별 1:1 상담 희망 (일정 협의)">개별 1:1 상담 희망 (일정 협의)</option>');
      selectEl.innerHTML = options.join('');
    }
  }

  async function loadSeminarDataFromDB() {
    renderSeminarSettings(cfg.DEFAULT_SEMINAR_SETTINGS);
    renderSeminarSchedules(cfg.DEFAULT_SEMINAR_SCHEDULES);

    if (!isConfigured || !supabaseClient) return;

    try {
      const [settingsRes, schedulesRes] = await Promise.all([
        supabaseClient.from('seminar_settings').select('*').eq('id', 1).maybeSingle(),
        supabaseClient
          .from('seminar_schedules')
          .select('*')
          .eq('is_active', true)
          .order('id', { ascending: true }),
      ]);

      if (!settingsRes.error && settingsRes.data) {
        renderSeminarSettings(settingsRes.data);
      }
      if (!schedulesRes.error && Array.isArray(schedulesRes.data) && schedulesRes.data.length > 0) {
        renderSeminarSchedules(schedulesRes.data);
      }
    } catch (err) {
      console.warn('[GFC] Supabase 로드 중 오류가 발생하여 기본값으로 표시합니다:', err);
    }
  }

  /* ---------- Application Form Handling ---------- */
  function showFormError(msg) {
    const errBox = document.getElementById('formError');
    if (!errBox) return;
    if (!msg) {
      errBox.textContent = '';
      errBox.classList.remove('show');
      return;
    }
    errBox.textContent = msg;
    errBox.classList.add('show');
    errBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function updateBirthStatusUI(rawValue) {
    const statusEl = document.getElementById('birthStatus');
    if (!statusEl) return null;
    const digits = cleanDigits(rawValue);

    if (digits.length < 6) {
      statusEl.textContent = '';
      statusEl.className = 'birth-status';
      return null;
    }

    const result = parseAndValidateBirth6(digits);
    statusEl.textContent = result.message;
    statusEl.className = `birth-status ${result.valid ? 'ok' : 'blocked'}`;
    return result;
  }

  function bindApplicationForm() {
    const form = document.getElementById('applicationForm');
    const birthInput = document.getElementById('applicantBirth');
    const phoneInput = document.getElementById('applicantPhone');
    const submitBtn = document.getElementById('submitAppBtn');

    // Dynamic hint reflecting exact year rule
    const hintEl = document.getElementById('birthHintText');
    if (hintEl) {
      const rule = getGfcAgeRule();
      hintEl.innerHTML = `※ GFC 위촉 가능 연령은 <strong>${rule.maxAge}세 이하</strong>로 제한됩니다. (${rule.appointmentYear}년 위촉 기준 <strong>${rule.minBirthYear}년생까지</strong> 가능 · 생일 무관, 출생연도 기준)`;
    }

    if (birthInput) {
      birthInput.addEventListener('input', (e) => {
        const cleaned = cleanDigits(e.target.value).slice(0, 6);
        e.target.value = cleaned;
        updateBirthStatusUI(cleaned);
      });
    }

    if (phoneInput) {
      phoneInput.addEventListener('input', (e) => {
        e.target.value = formatKoreanPhone(e.target.value);
      });
    }

    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      showFormError('');

      const name = (document.getElementById('applicantName')?.value || '').trim();
      const birthRaw = cleanDigits(document.getElementById('applicantBirth')?.value || '');
      const birthCheck = parseAndValidateBirth6(birthRaw);
      const phone = formatKoreanPhone(document.getElementById('applicantPhone')?.value || '');
      const phoneDigits = cleanDigits(phone);
      const scheduleInfo = (document.getElementById('applicantSchedule')?.value || '').trim();
      const agreed = Boolean(document.getElementById('privacyAgree')?.checked);

      if (name.length < 2) {
        showFormError('성함을 2자 이상 정확히 입력해 주세요.');
        document.getElementById('applicantName')?.focus();
        return;
      }

      if (!birthCheck.valid) {
        updateBirthStatusUI(birthRaw);
        showFormError(birthCheck.message);
        document.getElementById('applicantBirth')?.focus();
        return;
      }

      if (!/^01[016789][0-9]{7,8}$/.test(phoneDigits)) {
        showFormError('휴대전화 번호를 정확히 입력해 주세요. (예: 010-1234-5678)');
        document.getElementById('applicantPhone')?.focus();
        return;
      }

      if (!scheduleInfo) {
        showFormError('희망 참석 일정을 선택해 주세요.');
        document.getElementById('applicantSchedule')?.focus();
        return;
      }

      if (!agreed) {
        showFormError('필수 개인정보 수집 및 이용에 동의해 주세요.');
        document.getElementById('privacyAgree')?.focus();
        return;
      }

      const payload = {
        track: 'GFC',
        name,
        phone,
        age_group: birthCheck.formatted, // 예: "650315 (1965년생)"
        schedule_info: scheduleInfo,
        is_contacted: false,
        status: '신규접수',
        memo: '',
      };

      const origText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '예약 접수 중...';
      }

      try {
        if (isConfigured && supabaseClient) {
          const { error } = await supabaseClient.from('applications').insert([payload]);
          if (error) throw error;
        } else {
          console.info('[GFC] Supabase 미설정(데모 모드) — 접수 데이터:', payload);
        }

        const summaryEl = document.getElementById('successSummary');
        if (summaryEl) {
          summaryEl.innerHTML = `
            <div><span>지원 분야</span><strong>GFC (기업재무컨설턴트)</strong></div>
            <div><span>성함 / 생년월일</span><strong>${escapeHtml(name)} (${escapeHtml(birthCheck.formatted)})</strong></div>
            <div><span>연락처</span><strong>${escapeHtml(phone)}</strong></div>
            <div><span>희망 일정</span><strong>${escapeHtml(scheduleInfo)}</strong></div>
          `;
        }

        const leadEl = document.getElementById('successLeadText');
        if (leadEl) {
          leadEl.textContent = isConfigured
            ? `남산법인지점 ${currentSettings.manager_name}이 영업일 기준 1일 이내에 남겨주신 번호로 좌석 확정 안내 연락을 드리겠습니다.`
            : `[미리보기 모드] config.js에 Supabase 키를 입력하면 DB에 자동 저장됩니다. (${currentSettings.manager_name} 문의 가능)`;
        }

        form.reset();
        updateBirthStatusUI('');
        openModal('successModal');
      } catch (err) {
        console.error('[GFC] 신청 저장 실패:', err);
        const fallbackPhone = formatKoreanPhone(currentSettings.manager_phone || '010-4558-1663');
        showFormError(
          `신청 접수 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도하거나 전화(${fallbackPhone})로 문의해 주세요.`
        );
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = origText;
        }
      }
    });
  }

  /* ---------- Init ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    bindNavigation();
    bindFaqAccordion();
    bindModals();
    bindApplicationForm();
    loadSeminarDataFromDB();
  });
})();
