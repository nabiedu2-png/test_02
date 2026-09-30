import { calculateDistance, generateNearbyParks } from './parks-generator.js';

// 애플리케이션 상태 관리
const state = {
    userCoords: { lat: 37.5800, lng: 126.9830 }, // 기본 좌표 (종로구 안국/북촌 중심)
    isSimulation: true,
    allParks: [],
    filteredParks: [],
    searchRadius: 3000, // 기본 3km (단위: 미터)
    activeCategory: '전체', // 대분류 카테고리 필터
    sortBy: 'quietness', // 'quietness' (고요함 순) 또는 'distance' (거리 순)
    
    // 지도 인스턴스
    map: null,
    navMap: null,
    
    // 지도 요소
    userMarker: null,
    parkMarkers: [],
    navUserMarker: null,
    navParkMarker: null,
    routingLine: null,
    
    activePark: null,
    tempMarker: null
};

// DOM 요소 캐싱
const DOM = {
    radiusSlider: document.getElementById('radiusSlider'),
    radiusValue: document.getElementById('radiusValue'),
    tagFiltersContainer: document.getElementById('tagFilters'),
    parksList: document.getElementById('parksList'),
    listCount: document.getElementById('listCount'),
    sortBtn: document.getElementById('sortBtn'),
    sortLabel: document.getElementById('sortLabel'),
    mapStatus: document.getElementById('mapStatus'),
    statusIndicator: document.getElementById('statusIndicator'),
    statusText: document.getElementById('statusText'),
    locationSimText: document.getElementById('locationSimText'),
    
    // 길안내 오버레이 요소
    navOverlay: document.getElementById('navOverlay'),
    navBackBtn: document.getElementById('navBackBtn'),
    navDestName: document.getElementById('navDestName'),
    navDestDesc: document.getElementById('navDestDesc'),
    navSummaryTime: document.getElementById('navSummaryTime'),
    navSummaryDistance: document.getElementById('navSummaryDistance'),
    navTimeline: document.getElementById('navTimeline'),
    
    // 토스트 알림
    toastMsg: document.getElementById('toastMsg'),
    toastText: document.getElementById('toastText'),

    // 정원 추가 바텀 시트 관련
    bottomSheetOverlay: document.getElementById('bottomSheetOverlay'),
    bottomSheet: document.getElementById('bottomSheet'),
    closeSheetBtn: document.getElementById('closeSheetBtn'),
    addGardenForm: document.getElementById('addGardenForm'),
    gardenName: document.getElementById('gardenName'),
    gardenCoords: document.getElementById('gardenCoords'),
    gardenCategory: document.getElementById('gardenCategory'),
    ratingStars: document.getElementById('ratingStars'),
    gardenRating: document.getElementById('gardenRating'),
    formTagChips: document.getElementById('formTagChips'),
    gardenComment: document.getElementById('gardenComment'),
    recenterBtn: document.getElementById('recenterBtn'),

    // 에어비앤비 스타일 토글 뷰 요소
    appContainer: document.querySelector('.app-container'),
    viewToggleBtn: document.getElementById('viewToggleBtn'),
    toggleBtnIcon: document.getElementById('toggleBtnIcon'),
    toggleBtnText: document.getElementById('toggleBtnText'),
    mapFloatingCard: document.getElementById('mapFloatingCard')
};

// 앱 초기화 실행
window.addEventListener('DOMContentLoaded', () => {
    initApp();
});

// 메인 초기화 함수
function initApp() {
    setupEventListeners();
    setupAddGardenForm();
    setupMap(); // 지도를 즉시 렌더링하여 빈 화면 방지
    loadParksData(); // 초기 데이터 로드
    requestUserLocation(); // 실시간 현위치 획득 시도
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // 1. 반경 슬라이더
    DOM.radiusSlider.addEventListener('input', (e) => {
        state.searchRadius = parseInt(e.target.value);
        const kmVal = (state.searchRadius / 1000).toFixed(1);
        DOM.radiusValue.textContent = `${kmVal}km`;
        filterAndRenderParks();
        
        // 탐색 반경 변경 시 지도 범위 조절 (반경에 맞게 줌 레벨 조정)
        if (state.map) {
            const zoomLevel = state.searchRadius >= 3000 ? 13.5 : (state.searchRadius >= 2000 ? 14 : 15);
            state.map.setView([state.userCoords.lat, state.userCoords.lng], zoomLevel);
        }
    });

    // 2. 카테고리 필터링 (5대 대분류)
    const catButtons = DOM.tagFiltersContainer.querySelectorAll('.tag-btn');
    catButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            catButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.activeCategory = btn.dataset.category || '전체';
            filterAndRenderParks();
        });
    });

    // 3. 정렬 방식 전환
    DOM.sortBtn.addEventListener('click', () => {
        if (state.sortBy === 'quietness') {
            state.sortBy = 'distance';
            DOM.sortLabel.textContent = '거리 가까운 순';
            showToast('거리 순으로 정렬되었습니다.');
        } else {
            state.sortBy = 'quietness';
            DOM.sortLabel.textContent = '고요함 점수 순';
            showToast('고요함 점수 순으로 정렬되었습니다.');
        }
        filterAndRenderParks();
    });

    // 4. 길안내 뒤로가기 버튼
    DOM.navBackBtn.addEventListener('click', () => {
        DOM.navOverlay.classList.remove('active');
        state.activePark = null;
    });

    // 5. 바텀 시트 닫기 이벤트
    DOM.closeSheetBtn.addEventListener('click', () => {
        closeAddGardenSheet();
    });

    DOM.bottomSheetOverlay.addEventListener('click', () => {
        closeAddGardenSheet();
    });

    // 6. 현위치 돌아가기 버튼 클릭 이벤트
    DOM.recenterBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // 지도의 클릭 이벤트(바텀 시트 팝업) 방지
        if (state.isSimulation) {
            showToast('실제 위치 정보를 다시 확인합니다...');
            requestUserLocation(true);
        } else if (state.map) {
            state.map.setView([state.userCoords.lat, state.userCoords.lng], 15);
            showToast('현재 위치로 지도를 이동했습니다.');
        }
    });

    // 7. 에어비앤비 스타일 목록 ↔ 지도 전환 토글 버튼
    if (DOM.viewToggleBtn) {
        DOM.viewToggleBtn.addEventListener('click', () => {
            toggleViewMode();
        });
    }

    // 8. 상태 안내바 클릭 시 즉시 숨김
    if (DOM.mapStatus) {
        DOM.mapStatus.addEventListener('click', () => {
            DOM.mapStatus.classList.add('fade-out');
        });
    }
}

// 목록 ↔ 지도 뷰 모드 토글 함수
function toggleViewMode(forceShowMap = null) {
    if (!DOM.appContainer) return;

    const isCurrentlyMap = DOM.appContainer.classList.contains('show-map');
    const shouldShowMap = forceShowMap !== null ? forceShowMap : !isCurrentlyMap;

    if (shouldShowMap) {
        DOM.appContainer.classList.add('show-map');
        if (DOM.toggleBtnIcon) DOM.toggleBtnIcon.className = 'fa-solid fa-list-ul';
        if (DOM.toggleBtnText) DOM.toggleBtnText.textContent = '목록 보기';

        // 지도 렌더링 영역 크기 Leaflet에 즉시 재계산 (타일 깨짐 완벽 방지)
        setTimeout(() => {
            if (state.map) {
                state.map.invalidateSize();
            }
            // 지도 모드로 전환 시 선택된 정원이 없으면 1위 정원을 기본 선택
            if (!state.activePark && state.filteredParks && state.filteredParks.length > 0) {
                selectGardenOnMap(state.filteredParks[0], 0);
            }
        }, 150);
    } else {
        DOM.appContainer.classList.remove('show-map');
        if (DOM.toggleBtnIcon) DOM.toggleBtnIcon.className = 'fa-solid fa-map';
        if (DOM.toggleBtnText) DOM.toggleBtnText.textContent = '지도 보기';
    }
}

// 지도에서 특정 정원 선택 및 하단 프리뷰 카드 노출
function selectGardenOnMap(park, idx = 0) {
    if (!park) return;
    state.activePark = park;

    // 모든 캡슐 마커의 active 스타일 해제 후 선택된 마커에 active 적용
    document.querySelectorAll('.garden-pill-marker').forEach(el => el.classList.remove('active'));
    const targetPill = document.getElementById(`marker-pill-${park.id}`);
    if (targetPill) {
        targetPill.classList.add('active');
    }

    if (state.map) {
        // 모바일 및 뷰포트에서 마커가 상단-중간에 오도록 약간 아래 위도 오프셋 적용
        state.map.setView([park.lat - 0.002, park.lng], 15);
    }

    // 하단 플로팅 카드 렌더링
    if (DOM.mapFloatingCard) {
        const admissionText = park.admission || '무료 개방';
        const categoryName = park.category || '도심 속 작은 정원';

        DOM.mapFloatingCard.innerHTML = `
            <div class="floating-card-header">
                <div>
                    <div class="floating-card-title">
                        <span class="card-rank-badge">No. ${idx + 1}</span>
                        <span>${park.name}</span>
                    </div>
                    <div style="font-size:11px; color:var(--color-primary); font-weight:600; margin-top:2px;">
                        ${categoryName} · ${admissionText}
                    </div>
                </div>
                <div class="floating-card-badge">
                    ${park.quietnessScore}<span style="font-size:10px; font-weight:normal;">점</span>
                </div>
            </div>
            
            <div class="floating-card-meta">
                <div>
                    <span><i class="fa-solid fa-location-arrow" style="font-size:10px;"></i> ${formatDistance(park.distance)}</span> · 
                    <span><i class="fa-solid fa-person-walking" style="font-size:10px;"></i> 도보 ${park.walkTime}분</span>
                </div>
                <div class="meta-right-stamp" style="font-size:10px; padding:1px 5px;">
                    ${park.congestion}
                </div>
            </div>

            <button type="button" class="floating-card-nav-btn" id="floatingNavStartBtn">
                <i class="fa-solid fa-route"></i> 카카오맵 도보 길안내 시작
            </button>
        `;

        DOM.mapFloatingCard.classList.add('active');

        document.getElementById('floatingNavStartBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            openKakaoMapNavigation(park);
        });
    }
}

// 목록 카드에서 특정 정원을 지도에서 보기
function switchToGardenOnMap(park, idx = 0) {
    toggleViewMode(true); // 지도 모드로 전환

    setTimeout(() => {
        selectGardenOnMap(park, idx);
    }, 180);
}

// 사용자 GPS 위치 요청
function requestUserLocation(showFeedback = false) {
    if ("geolocation" in navigator) {
        // GPS 신호 탐색 상태 표시
        updateLocationStatus('searching', '위치 신호 수신 중...');
        
        // 1차: 고정밀도(GPS/정밀 WiFi) 수신 시도
        navigator.geolocation.getCurrentPosition(
            (position) => {
                applyUserPosition(position.coords.latitude, position.coords.longitude);
                if (showFeedback) {
                    showToast('현재 위치를 성공적으로 확인했습니다.');
                }
            },
            (error) => {
                console.warn("고정밀 GPS 수신 실패 또는 지연. 일반 정확도로 1회 재시도:", error);
                
                // 2차 fallback: 일반 정확도(IP/기본 네트워크)로 재시도
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        applyUserPosition(position.coords.latitude, position.coords.longitude);
                        if (showFeedback) {
                            showToast('현재 위치를 확인했습니다.');
                        }
                    },
                    (fallbackError) => {
                        console.warn("위치 정보 최종 획득 실패:", fallbackError);
                        let errorMsg = '위치 권한을 획득할 수 없어 기본 위치(서울숲)를 기준으로 탐색합니다.';
                        if (fallbackError.code === fallbackError.PERMISSION_DENIED) {
                            errorMsg = '위치 권한이 차단되어 기본 위치(서울숲)로 표시됩니다. 주소창에서 권한을 허용해 주세요.';
                        } else if (fallbackError.code === fallbackError.TIMEOUT) {
                            errorMsg = '위치 수신 시간이 초과되어 가상 위치(서울숲)를 기준으로 탐색합니다.';
                        }
                        
                        showToast(errorMsg, 4000);
                        updateLocationStatus('simulated', '가상 위치 활성화');
                    },
                    { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
                );
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
    } else {
        showToast('이 브라우저는 위치 서비스를 지원하지 않아 가상 위치를 사용합니다.', 4000);
        updateLocationStatus('simulated', '가상 위치 활성화');
    }
}

// 위치 수신 성공 시 사용자 좌표 적용 및 뷰 갱신
function applyUserPosition(lat, lng) {
    state.userCoords.lat = lat;
    state.userCoords.lng = lng;
    state.isSimulation = false;
    
    updateLocationStatus('success', '현 위치 탐색 성공');
    
    if (state.userMarker) {
        state.userMarker.setLatLng([lat, lng]);
    }
    if (state.map) {
        state.map.setView([lat, lng], 15);
    }
    loadParksData();
}

// 상단 상태 인디케이터 업데이트
let statusFadeTimeout = null;
function updateLocationStatus(status, text) {
    DOM.statusText.textContent = text;
    DOM.statusIndicator.className = 'status-indicator';
    
    if (statusFadeTimeout) {
        clearTimeout(statusFadeTimeout);
        statusFadeTimeout = null;
    }

    if (status === 'searching') {
        DOM.locationSimText.style.display = 'none';
        DOM.mapStatus.classList.remove('fade-out');
    } else if (status === 'success') {
        DOM.statusIndicator.classList.add('success');
        DOM.locationSimText.style.display = 'none';
        DOM.mapStatus.classList.remove('fade-out');
        statusFadeTimeout = setTimeout(() => {
            DOM.mapStatus.classList.add('fade-out');
        }, 3000);
    } else if (status === 'simulated') {
        DOM.locationSimText.style.display = 'inline';
        DOM.mapStatus.classList.remove('fade-out');
        statusFadeTimeout = setTimeout(() => {
            DOM.mapStatus.classList.add('fade-out');
        }, 3000);
    }
}

// Leaflet 지도 초기화
function setupMap() {
    if (state.map) {
        return; // 이미 지도 객체가 생성된 경우 중복 생성 방지
    }

    // Leaflet 맵 객체 생성
    state.map = L.map('map', {
        zoomControl: true,
        scrollWheelZoom: false // 모바일 화면 스크롤 시 지도가 스크롤을 막는 현상 방지
    }).setView([state.userCoords.lat, state.userCoords.lng], 15);

    // 공식 OpenStreetMap 표준 타일 레이어 로드 (완전 무료, 키 불필요, 워터마크 없음)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(state.map);

    // 사용자 위치 커스텀 아이콘 설정
    const userIcon = L.divIcon({
        className: 'user-marker-icon',
        html: '<div class="user-marker-pulse"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    state.userMarker = L.marker([state.userCoords.lat, state.userCoords.lng], { icon: userIcon })
        .addTo(state.map)
        .bindPopup(`
            <div class="popup-title">나의 현 위치</div>
            <div class="popup-distance">여기서부터 비밀 정원을 탐색합니다.</div>
        `);

    // 지도 클릭 시 바텀 시트 열기 및 임시 마커 표시
    state.map.on('click', (e) => {
        if (state.activePark) {
            DOM.navOverlay.classList.remove('active');
            state.activePark = null;
        }
        
        const { lat, lng } = e.latlng;
        openAddGardenSheet(lat, lng);
    });
}

// 공원 데이터 적재
function loadParksData() {
    // 기존 사용자가 직접 제보하여 추가한 정원 보존
    const userSubmittedParks = state.allParks.filter(p => p.id && String(p.id).startsWith('park-user-'));

    // 로컬 JSON 파일을 fetch로 비동기 로드
    fetch('./gardens-data.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('네트워크 응답 에러');
            }
            return response.json();
        })
        .then(data => {
            // JSON 정원 목록의 거리와 도보 시간 갱신
            let parks = data.map(park => {
                const distance = calculateDistance(state.userCoords.lat, state.userCoords.lng, park.lat, park.lng);
                const walkTime = Math.ceil(distance / 66);
                return {
                    ...park,
                    distance: distance,
                    walkTime: walkTime
                };
            });

            // 사용자 직접 제보 정원 거리 갱신 및 결합
            const updatedUserParks = userSubmittedParks.map(p => {
                const distance = calculateDistance(state.userCoords.lat, state.userCoords.lng, p.lat, p.lng);
                return { ...p, distance, walkTime: Math.ceil(distance / 66) };
            });

            state.allParks = [...updatedUserParks, ...parks];
            filterAndRenderParks();
        })
        .catch(error => {
            console.warn('정원 데이터 fetch 실패, 현 위치 기반 공원 자동 생성기로 대체:', error);
            const generatedParks = generateNearbyParks(state.userCoords.lat, state.userCoords.lng);
            state.allParks = [...userSubmittedParks, ...generatedParks];
            filterAndRenderParks();
        });
}

// 필터링 및 정렬 처리 후 렌더링
function filterAndRenderParks() {
    // 1. 반경 필터링 (meter 단위 비교)
    let results = state.allParks.filter(park => park.distance <= state.searchRadius);
    
    // 2. 카테고리 필터링 (대분류 선택)
    if (state.activeCategory && state.activeCategory !== '전체') {
        results = results.filter(park => park.category === state.activeCategory);
    }

    // 3. 정렬 처리
    if (state.sortBy === 'quietness') {
        // 고요함 점수가 높은 순으로 정렬 (점수가 같으면 가까운 순)
        results.sort((a, b) => {
            if (b.quietnessScore === a.quietnessScore) {
                return a.distance - b.distance;
            }
            return b.quietnessScore - a.quietnessScore;
        });
    } else {
        // 거리가 가까운 순으로 정렬
        results.sort((a, b) => a.distance - b.distance);
    }

    state.filteredParks = results;
    
    // 카운터 및 목록 렌더링
    const kmStr = (state.searchRadius / 1000).toFixed(1);
    DOM.listCount.innerHTML = `<i class="fa-solid fa-tree"></i> 반경 ${kmStr}km 내 정원 <strong>${state.filteredParks.length}곳</strong>`;
    renderParksList();
    renderParksMarkers();
}

// 리스트 카드 렌더링
function renderParksList() {
    DOM.parksList.innerHTML = '';

    if (state.filteredParks.length === 0) {
        DOM.parksList.innerHTML = `
            <div class="empty-results">
                <i class="fa-solid fa-tree-deciduous"></i>
                <p>지정한 필터 조건 내에 비밀 정원이 없습니다.<br>반경을 넓히거나 다른 카테고리를 골라보세요.</p>
            </div>
        `;
        return;
    }

    state.filteredParks.forEach((park, idx) => {
        const card = document.createElement('div');
        card.className = 'park-card';

        const scaleText = park.scale ? park.scale.split('(')[0].trim() : '도심 정원';
        const treesText = (park.trees && park.trees.length > 0) ? park.trees.slice(0, 2).join('·') : '사계절 수목';
        const admissionText = park.admission || '무료 개방';
        const categoryName = park.category || '도심 속 작은 정원';

        card.innerHTML = `
            <div class="park-card-header">
                <div>
                    <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 4px;">
                        <span class="card-rank-badge">No. ${idx + 1}</span>
                        <span class="card-category-tag" style="margin-bottom: 0;">
                            <i class="fa-solid fa-leaf"></i> ${categoryName}
                        </span>
                    </div>
                    <h3 class="park-title">${park.name}</h3>
                </div>
                <div class="quietness-badge">
                    <span class="score-num">${park.quietnessScore}<span style="font-size:11px; font-weight:normal;">점</span></span>
                    <span class="score-label">고요함 점수</span>
                </div>
            </div>
            
            <p class="park-description">${park.description}</p>
            
            <div class="park-specs">
                <span class="spec-chip admission"><i class="fa-solid fa-ticket"></i> ${admissionText}</span>
                <span class="spec-chip scale"><i class="fa-solid fa-expand"></i> ${scaleText}</span>
                <span class="spec-chip trees"><i class="fa-solid fa-tree"></i> ${treesText}</span>
            </div>

            <div class="card-tags">
                ${park.tags ? park.tags.slice(0, 3).map(tag => `<span class="card-tag">#${tag}</span>`).join('') : ''}
            </div>

            <div class="park-meta">
                <div class="meta-left">
                    <span class="meta-distance">
                        <i class="fa-solid fa-location-arrow" style="font-size:10px;"></i> ${formatDistance(park.distance)}
                    </span>
                    <span class="meta-time">
                        <i class="fa-solid fa-person-walking" style="font-size:10px;"></i> 도보 ${park.walkTime}분
                    </span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="meta-right-stamp">
                        ${park.congestion}
                    </div>
                    <button type="button" class="card-direct-nav-btn" data-id="${park.id}" title="지도에서 위치 확인">
                        <i class="fa-solid fa-map-location-dot"></i> 위치 확인
                    </button>
                </div>
            </div>
        `;

        // 카드 클릭 인터랙션: 카드 본문 또는 [위치 확인] 클릭 시 지도로 전환하여 해당 정원 강조
        card.addEventListener('click', () => {
            switchToGardenOnMap(park, idx);
        });

        DOM.parksList.appendChild(card);
    });
}

// 지도 마커 렌더링 (에어비앤비 스타일 넘버링 캡슐 마커)
function renderParksMarkers() {
    // 기존 마커 제거
    state.parkMarkers.forEach(marker => state.map.removeLayer(marker));
    state.parkMarkers = [];

    state.filteredParks.forEach((park, idx) => {
        const customIcon = L.divIcon({
            className: 'custom-pill-wrapper',
            html: `
                <div class="garden-pill-marker ${idx === 0 ? 'active' : ''}" id="marker-pill-${park.id}">
                    <span class="marker-num">${idx + 1}</span>
                    <span class="marker-score">${park.quietnessScore}점</span>
                </div>
            `,
            iconSize: [64, 26],
            iconAnchor: [32, 13]
        });

        const marker = L.marker([park.lat, park.lng], { icon: customIcon })
            .addTo(state.map);

        // 마커 클릭 시 하단 카드에 정보 노출 및 줌인
        marker.on('click', () => {
            selectGardenOnMap(park, idx);
        });

        state.parkMarkers.push(marker);
    });
}

// 카카오맵 공식 길찾기 새 창 연결 (출발지: 현 위치, 도착지: 선택 정원)
function openKakaoMapNavigation(park) {
    const fromName = encodeURIComponent('내 위치');
    const toName = encodeURIComponent(park.name);
    const kakaoMapUrl = `https://map.kakao.com/link/from/${fromName},${state.userCoords.lat},${state.userCoords.lng}/to/${toName},${park.lat},${park.lng}`;
    window.open(kakaoMapUrl, '_blank');
}

// 거리 포맷팅 함수 (m -> km 변환 등)
function formatDistance(meters) {
    if (meters >= 1000) {
        return `${(meters / 1000).toFixed(1)}km`;
    }
    return `${meters}m`;
}

// 토스트 팝업 띄우기 함수
let toastTimeout = null;
function showToast(text, duration = 3000) {
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }
    
    DOM.toastText.textContent = text;
    DOM.toastMsg.classList.add('show');
    
    toastTimeout = setTimeout(() => {
        DOM.toastMsg.classList.remove('show');
    }, duration);
}

// 새로운 정원 제보 바텀 시트 열기
function openAddGardenSheet(lat, lng) {
    // 1. 임시 마커 표시 (지도 클릭한 곳에 핀 꽂기)
    if (state.tempMarker) {
        state.map.removeLayer(state.tempMarker);
    }
    
    const tempIcon = L.divIcon({
        className: 'temp-marker-icon',
        html: '<i class="fa-solid fa-location-dot" style="font-size:16px;"></i>',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
    
    state.tempMarker = L.marker([lat, lng], { icon: tempIcon }).addTo(state.map);
    
    // 2. 폼 필드 초기화 및 좌표 입력 (소수점 5자리 포맷팅)
    DOM.gardenCoords.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    DOM.gardenName.value = '';
    
    // 태그 칩 선택 초기화 (모두 해제)
    const chips = DOM.formTagChips.querySelectorAll('.form-tag-chip');
    chips.forEach(chip => chip.classList.remove('active'));
    
    // 추천 코멘트 초기화
    DOM.gardenComment.value = '';
    
    // 별점 5점으로 초기화
    updateRatingStars(5);
    
    // 3. 바텀 시트와 오버레이 표시
    DOM.bottomSheet.classList.add('active');
    DOM.bottomSheetOverlay.classList.add('active');
    
    // 지도 중심을 약간 조정하여 마커와 바텀 시트가 겹치지 않게 처리
    state.map.panTo([lat, lng]);
}

// 새로운 정원 제보 바텀 시트 닫기
function closeAddGardenSheet() {
    // 1. 바텀 시트 및 오버레이 숨기기
    DOM.bottomSheet.classList.remove('active');
    DOM.bottomSheetOverlay.classList.remove('active');
    
    // 2. 임시 마커 제거
    if (state.tempMarker) {
        state.map.removeLayer(state.tempMarker);
        state.tempMarker = null;
    }
}

// 폼 초기 세팅 및 별점 인터랙션 바인딩
function setupAddGardenForm() {
    // 별점 버튼들에 대한 클릭 이벤트
    const starButtons = DOM.ratingStars.querySelectorAll('.star-btn');
    starButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const ratingValue = parseInt(btn.dataset.value);
            updateRatingStars(ratingValue);
        });
    });
    
    // 태그 칩 다중 선택 토글 이벤트 바인딩
    const tagChips = DOM.formTagChips.querySelectorAll('.form-tag-chip');
    tagChips.forEach(chip => {
        chip.addEventListener('click', (e) => {
            e.preventDefault();
            chip.classList.toggle('active');
        });
    });
    
    // 폼 제출 이벤트
    DOM.addGardenForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const name = DOM.gardenName.value.trim();
        const coordsStr = DOM.gardenCoords.value;
        const rating = parseInt(DOM.gardenRating.value);
        const comment = DOM.gardenComment.value.trim();
        
        if (!name) {
            showToast('정원 이름을 입력해 주세요.');
            return;
        }
        if (!coordsStr) {
            showToast('위도/경도 좌표가 올바르지 않습니다.');
            return;
        }
        
        const [latStr, lngStr] = coordsStr.split(',');
        const lat = parseFloat(latStr.trim());
        const lng = parseFloat(lngStr.trim());
        
        // 거리 계산 (사용자 기준)
        const distance = calculateDistance(state.userCoords.lat, state.userCoords.lng, lat, lng);
        const walkTime = Math.ceil(distance / 66); // 도보 속도 4km/h 기준
        
        // 고요함 점수 (별점에 따라 변환)
        let quietnessScore = 98;
        if (rating === 4) quietnessScore = 92;
        else if (rating === 3) quietnessScore = 85;
        else if (rating === 2) quietnessScore = 78;
        else if (rating === 1) quietnessScore = 65;
        
        let congestion = "매우 한적함";
        if (quietnessScore < 90) {
            congestion = "한적함";
        }
        
        // 선택된 태그 목록 수집
        const selectedTags = [];
        const activeChips = DOM.formTagChips.querySelectorAll('.form-tag-chip.active');
        activeChips.forEach(chip => {
            selectedTags.push(chip.dataset.tag);
        });
        
        // 만약 선택된 태그가 없다면 기본적으로 "조용한" 부여
        if (selectedTags.length === 0) {
            selectedTags.push("조용한");
        }
        
        const category = DOM.gardenCategory ? DOM.gardenCategory.value : '도심 속 작은 정원';
        
        // 새로운 정원 데이터 객체 생성
        const newPark = {
            id: `park-user-${Date.now()}`, // 고유 ID 부여
            name: name,
            category: category,
            scale: '시민 제보 쉼터',
            admission: '무료 개방',
            lat: lat,
            lng: lng,
            quietnessScore: quietnessScore,
            congestion: congestion,
            trees: ['사계절 수목'],
            tags: selectedTags,
            description: comment || `이곳은 사용자가 제보한 정원입니다. 고요함 점수 ${quietnessScore}점의 아늑하고 평화로운 공간입니다.`,
            distance: distance,
            walkTime: walkTime
        };
        
        // 데이터 적재 및 UI 갱신
        state.allParks.unshift(newPark); // 새로 제보한 것을 맨 위에 노출하도록 unshift
        filterAndRenderParks();
        
        // 성공 처리
        showToast(`새로운 정원 '${name}'이(가) 성공적으로 제보되었습니다!`);
        closeAddGardenSheet();
    });
}

// 별점 상태 업데이트 헬퍼
function updateRatingStars(rating) {
    DOM.gardenRating.value = rating;
    const starButtons = DOM.ratingStars.querySelectorAll('.star-btn');
    starButtons.forEach(btn => {
        const val = parseInt(btn.dataset.value);
        const icon = btn.querySelector('i');
        if (val <= rating) {
            btn.classList.add('active');
            icon.className = 'fa-solid fa-star';
        } else {
            btn.classList.remove('active');
            icon.className = 'fa-regular fa-star';
        }
    });
}
