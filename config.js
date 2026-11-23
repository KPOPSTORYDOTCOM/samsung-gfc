/**
 * 삼성생명 남산법인지점 GFC / SFP 통합 채용 웹사이트 환경 설정
 * -----------------------------------------------------------------------------
 * 아래 SUPABASE_URL과 SUPABASE_ANON_KEY에 본인 프로젝트 값을 입력하면
 * 별도 빌드 없이 index.html 및 admin.html이 즉시 Supabase DB와 연동됩니다.
 * (Supabase 대시보드 > Project Settings > API 에서 확인 가능)
 */

window.APP_CONFIG = {
  // 운영 도메인
  SITE_URL: 'https://samsung-gfc.mycard.co.kr',

  // [필수 입력] Supabase 프로젝트 URL 및 공개 Anon Key
  SUPABASE_URL: 'https://YOUR_PROJECT_ID.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',

  // DB 미연결 또는 오류 시 화면이 깨지지 않도록 표시되는 기본값 (site1.md 기준)
  DEFAULT_SEMINAR_SETTINGS: {
    id: 1,
    title: '11월 잡설명회 초대',
    location: '그레이스리 서울호텔 2층 (서울 중구 세종대로12길 12 · 시청역 8번출구 100m)',
    description:
      '잡설명회는 중식 포함 3시간 소요되며, 참석 무료·사전예약제로 운영됩니다. 참가에 대한 아무런 의무사항도 없습니다.',
    manager_name: '김지훈 팀장',
    manager_phone: '010-4558-1663',
  },

  DEFAULT_SEMINAR_SCHEDULES: [
    { id: 1, round_name: '1차', event_date: '11/6 (금)', event_time: '10:00–13:00', capacity: 30, is_active: true },
    { id: 2, round_name: '2차', event_date: '11/11 (수)', event_time: '10:00–13:00', capacity: 30, is_active: true },
    { id: 3, round_name: '3차', event_date: '11/18 (수)', event_time: '10:00–13:00', capacity: 30, is_active: true },
    { id: 4, round_name: '4차', event_date: '11/26 (목)', event_time: '10:00–13:00', capacity: 30, is_active: true },
  ],
};

/**
 * Supabase 설정 완료 여부 판별 및 클라이언트 생성 헬퍼
 */
window.createAppSupabaseClient = function () {
  const cfg = window.APP_CONFIG || {};
  const url = (cfg.SUPABASE_URL || '').trim();
  const key = (cfg.SUPABASE_ANON_KEY || '').trim();
  const isConfigured =
    Boolean(url) &&
    Boolean(key) &&
    !url.includes('YOUR_PROJECT_ID') &&
    !key.includes('YOUR_SUPABASE_ANON_KEY') &&
    typeof window.supabase !== 'undefined' &&
    typeof window.supabase.createClient === 'function';

  if (!isConfigured) {
    return { client: null, isConfigured: false };
  }
  return {
    client: window.supabase.createClient(url, key),
    isConfigured: true,
  };
};
