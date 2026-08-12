// Q&A 사이트 전용 Firebase 연동 설정 — 기존 루트의 firebaseConfig.js와 완전히 별개의 파일입니다.
// (같은 Firebase 프로젝트의 공개 식별값을 그대로 복제해 둔 것으로, 이 파일을 지우거나 바꿔도
//  기존 루트 사이트(../firebaseConfig.js)에는 전혀 영향이 없습니다.)
// Firebase 웹 apiKey는 비밀키가 아니라 프로젝트 식별용 공개 값입니다(실제 접근 제어는
// Firestore 보안 규칙이 담당). Q&A 데이터는 기존 컬렉션과 이름이 겹치지 않는 별도의
// qna_questions / qna_categories 컬렉션에만 저장됩니다.
window.QNA_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDyQBXCc0WN4wFVsGBLZ6GXsyV0sGvyG34",
  authDomain: "pour-dashboard.firebaseapp.com",
  projectId: "pour-dashboard",
  storageBucket: "pour-dashboard.firebasestorage.app",
  messagingSenderId: "886473497979",
  appId: "1:886473497979:web:e8b47d9e85f1571ee5b1de"
};
