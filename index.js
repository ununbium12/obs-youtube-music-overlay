const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const fetch = require('node-fetch'); // fetch 추가

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"; // 크롬 실행 경로
const DEBUG_PORT = 9222;
const YOUTUBE_MUSIC_URL = "https://music.youtube.com/";
const OUTPUT_FILE = path.join(__dirname, 'nowplaying.txt');

// 크롬 디버깅 모드로 실행
exec(`"${CHROME_PATH}" --remote-debugging-port=${DEBUG_PORT} --user-data-dir="C:\\chrome_debug" "${YOUTUBE_MUSIC_URL}"`, (err) => {
    if (err) {
        console.error('❌ 크롬 실행 오류:', err);
    } else {
        console.log('✅ 크롬이 디버깅 모드로 실행되고 유튜브 뮤직을 엽니다.');
        setTimeout(startPuppeteer, 5000); // 크롬이 완전히 실행될 시간을 주기 위해 5초 대기
    }
});

// webSocketDebuggerUrl 가져오기 (IPv4 강제 사용)
async function getWebSocketDebuggerUrl() {
    const DEBUG_URL = `http://127.0.0.1:${DEBUG_PORT}/json/version`;
    try {
        const response = await fetch(DEBUG_URL);
        const data = await response.json();
        return data.webSocketDebuggerUrl;
    } catch (error) {
        console.error("❌ 웹소켓 디버거 URL 가져오기 실패:", error);
        return null;
    }
}

// Puppeteer 실행
async function startPuppeteer() {
    console.log("🟡 Puppeteer 연결 시도 중...");
    
    try {
        const wsUrl = await getWebSocketDebuggerUrl();
        if (!wsUrl) {
            console.error("❌ 웹소켓 URL을 가져오지 못했습니다. 크롬이 올바르게 실행되었는지 확인하세요.");
            return;
        }

        const browser = await puppeteer.connect({
            browserWSEndpoint: wsUrl,
            defaultViewport: null
        });

        console.log("✅ Puppeteer 연결 성공!");
        const pages = await browser.pages();
        const page = pages.find(p => p.url().includes('music.youtube.com'));

        if (!page) {
            console.error('❌ 유튜브 뮤직 페이지를 찾을 수 없습니다. 먼저 크롬에서 유튜브 뮤직을 열어주세요.');
            return;
        }

        console.log('🎵 유튜브 뮤직 페이지 연결 완료');

        // 제목 변경 감지를 위한 MutationObserver 실행
        await page.evaluate(() => {
            const targetNode = document.querySelector('.content-info-wrapper');
            if (!targetNode) return;

            const observer = new MutationObserver(() => {
                const titleElement = document.querySelector('.content-info-wrapper yt-formatted-string.title');
                const title = titleElement ? titleElement.innerText : '🎵 No Title Found';
                window.localStorage.setItem('nowPlayingTitle', title); // 제목을 로컬스토리지에 저장
            });

            observer.observe(targetNode, { childList: true, subtree: true });
        });

        console.log('🔍 MutationObserver 설정 완료! 제목 변경 시 자동 감지됨.');

        // 2초마다 제목 확인 및 파일 저장
        setInterval(async () => {
            const title = await page.evaluate(() => window.localStorage.getItem('nowPlayingTitle') || '🎵 현재 플리 없음');
            console.log('🎶 현재 재생 중:', title);

            // 파일로 저장
            fs.writeFileSync(OUTPUT_FILE, title, 'utf8');
        }, 2000);

    } catch (error) {
        console.error('❌ Puppeteer 연결 오류:', error);
    }
}
