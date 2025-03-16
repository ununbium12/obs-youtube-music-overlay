const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const fetch = require('node-fetch');
const readline = require('readline');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DEBUG_PORT = 9222;
const OUTPUT_FILE = path.join(process.cwd(), 'nowplaying.txt');

const YOUTUBE_URL = "https://www.youtube.com/";
const YOUTUBE_MUSIC_URL = "https://music.youtube.com/";

// 📌 사용자가 유튜브 뮤직 또는 유튜브 일반을 선택할 수 있도록 함
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('🎵 유튜브 뮤직(1) / 📺 유튜브(2) 중 선택하세요: ', (answer) => {
    let selectedURL;
    if (answer === '1') {
        selectedURL = YOUTUBE_MUSIC_URL;
    } else if (answer === '2') {
        selectedURL = YOUTUBE_URL;
    } else {
        console.error('❌ 올바른 숫자를 입력하세요. (1 또는 2)');
        rl.close();
        return;
    }

    console.log(`✅ 선택한 서비스: ${selectedURL}`);
    rl.close();
    launchChrome(selectedURL);
});

// 🟡 크롬 실행
function launchChrome(url) {
    console.log('🔵 크롬을 디버깅 모드로 실행합니다...');

    const chromeProcess = exec(`"${CHROME_PATH}" --remote-debugging-port=${DEBUG_PORT} --user-data-dir="C:\\chrome_debug" "${url}"`, {
        detached: true,  // 크롬 프로세스를 독립적으로 실행
        stdio: 'ignore'
    });

    chromeProcess.unref();  // 부모 프로세스가 종료되더라도 크롬을 계속 실행하게 함

    console.log('🟢 크롬이 실행되었습니다. Puppeteer 연결을 시도합니다...');
    setTimeout(startPuppeteer, 5000); // 크롬이 완전히 실행될 시간을 줌
}

// 🟠 웹소켓 URL을 가져오기 (최대 10초 재시도)
async function getWebSocketDebuggerUrl(retryCount = 0) {
    const DEBUG_URL = `http://127.0.0.1:${DEBUG_PORT}/json/version`;

    try {
        const response = await fetch(DEBUG_URL);
        const data = await response.json();
        return data.webSocketDebuggerUrl;
    } catch (error) {
        if (retryCount < 10) {  // 최대 10초 대기
            console.warn(`⏳ 크롬이 아직 준비되지 않았습니다. (${retryCount + 1}/10)`);
            await new Promise(resolve => setTimeout(resolve, 1000));  // 1초 대기
            return getWebSocketDebuggerUrl(retryCount + 1);
        } else {
            console.error("❌ 웹소켓 디버거 URL 가져오기 실패:", error);
            return null;
        }
    }
}

// 🟣 Puppeteer 실행
async function startPuppeteer() {
    console.log("🟡 Puppeteer 연결 시도 중...");

    const wsUrl = await getWebSocketDebuggerUrl();
    if (!wsUrl) {
        console.error("❌ 웹소켓 URL을 가져오지 못했습니다.");
        return;
    }

    try {
        const browser = await puppeteer.connect({
            browserWSEndpoint: wsUrl,
            defaultViewport: null
        });

        console.log("✅ Puppeteer 연결 성공!");
        const pages = await browser.pages();
        const page = pages.find(p => p.url().includes('youtube.com'));

        if (!page) {
            console.error('❌ 유튜브 페이지를 찾을 수 없습니다.');
            return;
        }

        console.log('🎵 유튜브 페이지 연결 완료');

        await page.evaluate((isMusic) => {
            let targetNode;
            if (isMusic) {
                targetNode = document.querySelector('.content-info-wrapper');
            } else {
                targetNode = document.querySelector('h1.title.ytd-video-primary-info-renderer');
            }

            if (!targetNode) return;

            const observer = new MutationObserver(() => {
                let title;
                if (isMusic) {
                    const titleElement = document.querySelector('.content-info-wrapper yt-formatted-string.title');
                    title = titleElement ? titleElement.innerText : '🎵 No Title Found';
                } else {
                    const titleElement = document.querySelector('h1.title.ytd-video-primary-info-renderer');
                    title = titleElement ? titleElement.innerText : '📺 No Title Found';
                }
                window.localStorage.setItem('nowPlayingTitle', title);
            });

            observer.observe(targetNode, { childList: true, subtree: true });
        }, page.url().includes('music.youtube.com'));

        console.log('🔍 MutationObserver 설정 완료!');

        setInterval(async () => {
            const title = await page.evaluate((isMusic) => {
                if (isMusic) {
                    const titleElement = document.querySelector('.content-info-wrapper yt-formatted-string.title');
                    return titleElement ? titleElement.innerText : '🎵 No Title Found';
                } else {
                    const titleElement = document.querySelector('h1.title.ytd-video-primary-info-renderer');
                    return titleElement ? titleElement.innerText : '📺 No Title Found';
                }
            }, page.url().includes('music.youtube.com'));

            console.log('🎶 현재 재생 중:', title);
            fs.writeFileSync(OUTPUT_FILE, title, 'utf8');
        }, 2000);

    } catch (error) {
        console.error('❌ Puppeteer 연결 오류:', error);
    }
}
