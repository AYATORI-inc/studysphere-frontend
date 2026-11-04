// JWTトークンをデコードする関数
export const decodeJWT = (token) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('JWTデコードエラー:', error);
    return null;
  }
};

// ユーザーの実際のロール番号を取得
export const getActualRoleId = (authUser) => {
  // まずJWTトークンからロール情報を取得
  const accessToken = localStorage.getItem('accessToken');
  if (accessToken) {
    const decodedToken = decodeJWT(accessToken);
    if (decodedToken && decodedToken.role) {
      // 拠点管理者判定をチェック（簡易版）
      if (decodedToken.role === 4) {
        // 拠点管理者の場合はロール5として扱う
        return 5;
      }
      return decodedToken.role;
    }
  }
  
  // JWTから取得できない場合は、ユーザーオブジェクトのroleを試行
  return authUser?.role;
};

// 現在のユーザーの拠点IDを取得
export const normalizeSatelliteId = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'object') {
    if (value === null) {
      return null;
    }
    if ('id' in value) {
      return normalizeSatelliteId(value.id);
    }
  }

  const stringValue = String(value).trim();
  if (
    stringValue === '' ||
    stringValue.toLowerCase() === 'null' ||
    stringValue.toLowerCase() === 'undefined'
  ) {
    return null;
  }

  const numericValue = parseInt(stringValue, 10);
  if (Number.isNaN(numericValue)) {
    return null;
  }

  return numericValue;
};

export const getCurrentUserSatelliteId = (currentUser) => {
  console.log('=== getCurrentUserSatelliteId デバッグ ===');
  console.log('現在のユーザー情報:', currentUser);
  console.log('ユーザーロール:', currentUser?.role);
  console.log('satellite_ids:', currentUser?.satellite_ids);
  console.log('satellite_id:', currentUser?.satellite_id);
  console.log('satellite_name:', currentUser?.satellite_name);
  
  // 1. 管理者の場合、ログイン時選択した拠点を最優先で確認
  if (currentUser && currentUser.role >= 6 && currentUser.satellite_id) {
    const normalized = normalizeSatelliteId(currentUser.satellite_id);
    console.log('管理者用: ログイン時選択拠点IDを使用:', normalized);
    
    // セッションストレージとの同期を確認
    const sessionSelectedSatellite = sessionStorage.getItem('selectedSatellite');
    if (!sessionSelectedSatellite && currentUser.satellite_name && normalized) {
      // セッションストレージにない場合は同期
      const selectedSatelliteInfo = {
        id: normalized,
        name: currentUser.satellite_name,
        company_id: currentUser.company_id,
        company_name: currentUser.company_name
      };
      sessionStorage.setItem('selectedSatellite', JSON.stringify(selectedSatelliteInfo));
      console.log('セッションストレージに拠点情報を同期:', selectedSatelliteInfo);
    }
    
    return normalized;
  }
  
  // 2. セッションストレージから拠点情報を取得（全ユーザー用）
  try {
    const selectedSatellite = sessionStorage.getItem('selectedSatellite');
    if (selectedSatellite) {
      const satellite = JSON.parse(selectedSatellite);
      console.log('セッションストレージから取得した拠点情報:', satellite);
      const normalized = normalizeSatelliteId(satellite?.id);
      if (normalized) {
        console.log('セッションストレージから拠点IDを取得:', normalized);
        return normalized;
      }
    }
  } catch (error) {
    console.error('セッションストレージの拠点情報読み込みエラー:', error);
  }
  
  // 3. ユーザーのsatellite_idsから取得
  if (currentUser && currentUser.satellite_ids) {
    let satelliteIds = currentUser.satellite_ids;
    
    // 既に配列の場合はそのまま使用
    if (Array.isArray(satelliteIds)) {
      // 既に配列なのでそのまま使用
    } else if (typeof satelliteIds === 'string') {
      // 文字列の場合はJSONパースを試行
      try {
        satelliteIds = JSON.parse(satelliteIds);
      } catch (error) {
        console.error('satellite_idsのパースエラー:', error);
        // パースに失敗した場合は、カンマ区切りとして扱う
        if (satelliteIds.includes(',')) {
          satelliteIds = satelliteIds
            .split(',')
            .map(id => normalizeSatelliteId(id.trim()))
            .filter(id => id !== null);
        } else {
          satelliteIds = [normalizeSatelliteId(satelliteIds)];
        }
      }
    } else {
      // その他の型（数値など）の場合は配列に変換
      satelliteIds = [satelliteIds];
    }
    
    // 配列でない場合は配列に変換（念のため）
    if (!Array.isArray(satelliteIds)) {
      satelliteIds = [satelliteIds];
    }
    
    // すべてのIDを数値に変換して統一（文字列の"1", "2"なども数値に変換）
      satelliteIds = satelliteIds
        .map((id) => normalizeSatelliteId(id))
        .filter((id) => id !== null);
    
    if (satelliteIds.length > 0) {
      const satelliteId = normalizeSatelliteId(satelliteIds[0]); // 数値に変換
      console.log('ユーザーから取得した拠点ID:', satelliteId);
      
      // 拠点IDが取得できた場合、sessionStorageに保存（まだ保存されていない場合）
      const sessionSelectedSatellite = sessionStorage.getItem('selectedSatellite');
      if (!sessionSelectedSatellite) {
        // sessionStorageに選択された拠点がない場合、最初の拠点IDを保存
        // 拠点名などの情報は後でAPIから取得される可能性があるため、まずはIDだけ保存
        const selectedSatelliteInfo = {
          id: satelliteId,
          name: currentUser.satellite_name || `拠点${satelliteId}`,
          company_id: currentUser.company_id,
          company_name: currentUser.company_name
        };
        sessionStorage.setItem('selectedSatellite', JSON.stringify(selectedSatelliteInfo));
        console.log('複数拠点所属指導員: sessionStorageに最初の拠点を保存:', selectedSatelliteInfo);
      } else {
        // sessionStorageに既に選択された拠点がある場合、整合性を確認
        try {
          const parsedSatellite = JSON.parse(sessionSelectedSatellite);
          // 選択された拠点IDがユーザーの所属拠点に含まれているか確認（型を統一して比較）
          const parsedSatelliteId = normalizeSatelliteId(parsedSatellite.id);
          const isIncluded = parsedSatelliteId
            ? satelliteIds.some(id => normalizeSatelliteId(id) === parsedSatelliteId)
            : false;
          if (!isIncluded) {
            console.log('選択された拠点IDが所属拠点に含まれていません。最初の拠点に変更します');
            const selectedSatelliteInfo = {
              id: satelliteId,
              name: currentUser.satellite_name || `拠点${satelliteId}`,
              company_id: currentUser.company_id,
              company_name: currentUser.company_name
            };
            sessionStorage.setItem('selectedSatellite', JSON.stringify(selectedSatelliteInfo));
          }
        } catch (error) {
          console.error('sessionStorageのselectedSatelliteパースエラー:', error);
          // パースエラーの場合は、最初の拠点IDを保存
          const selectedSatelliteInfo = {
            id: satelliteId,
            name: currentUser.satellite_name || `拠点${satelliteId}`,
            company_id: currentUser.company_id,
            company_name: currentUser.company_name
          };
          sessionStorage.setItem('selectedSatellite', JSON.stringify(selectedSatelliteInfo));
        }
      }
      
      return satelliteId;
    }
  }
  
  // 4. localStorageから拠点情報を取得
  try {
    const storedUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    console.log('localStorageのユーザー情報:', storedUser);
    
    // 管理者の場合、ログイン時選択した拠点を確認
    if (storedUser.role >= 6 && storedUser.satellite_id) {
      console.log('localStorage管理者用: ログイン時選択拠点IDを使用:', storedUser.satellite_id);
      return storedUser.satellite_id;
    }
    
    if (storedUser.satellite_ids) {
      let satelliteIds = storedUser.satellite_ids;
      
      // 既に配列の場合はそのまま使用
      if (Array.isArray(satelliteIds)) {
        // 既に配列なのでそのまま使用
      } else if (typeof satelliteIds === 'string') {
        // 文字列の場合はJSONパースを試行
        try {
          satelliteIds = JSON.parse(satelliteIds);
        } catch (error) {
          console.error('localStorageのsatellite_idsのパースエラー:', error);
          // パースに失敗した場合は、カンマ区切りとして扱う
          if (satelliteIds.includes(',')) {
            satelliteIds = satelliteIds
              .split(',')
              .map(id => normalizeSatelliteId(id.trim()))
              .filter(id => id !== null);
          } else {
            satelliteIds = [normalizeSatelliteId(satelliteIds)];
          }
        }
      }
      
      // 配列でない場合は配列に変換
      if (!Array.isArray(satelliteIds)) {
        satelliteIds = [satelliteIds];
      }
      
      // すべてのIDを数値に変換して統一
      satelliteIds = satelliteIds
        .map(id => normalizeSatelliteId(id))
        .filter(id => id !== null);
      
      if (satelliteIds.length > 0) {
        const satelliteId = normalizeSatelliteId(satelliteIds[0]); // 数値に変換
        console.log('localStorageから取得した拠点ID:', satelliteId);
        return satelliteId;
      }
    }
  } catch (error) {
    console.error('localStorageの読み込みエラー:', error);
  }
  
  console.log('拠点IDが見つかりません');
  return null;
};

// 指定された指導員が管理者かどうかをチェック
export const isTeacherManager = (teacherId, instructors, locationInfo) => {
  console.log(`=== 指導員 ${teacherId} の管理者判定開始 ===`);
  console.log('判定対象指導者ID:', teacherId, '型:', typeof teacherId);
  console.log('現在のinstructors:', instructors);
  console.log('現在のlocationInfo:', locationInfo);
  
      // まず、instructors配列から該当する指導員を検索
  const teacher = instructors.find(t => t.id === teacherId);
      console.log('instructorsから見つかった指導員:', teacher);
  
  if (teacher && teacher.is_manager !== undefined) {
    // APIから返されたis_managerフラグを優先使用
    console.log('APIから返されたis_managerフラグを使用:', teacher.is_manager);
          console.log(`=== 指導員 ${teacherId} の管理者判定完了（APIフラグ） ===`);
    return teacher.is_manager;
  }
  
  // フォールバック: locationInfo.manager_idsを使用
  console.log('APIフラグが未定義、locationInfo.manager_idsを使用');
  if (!locationInfo.manager_ids) {
    console.log('locationInfo.manager_idsが未定義');
          console.log(`=== 指導員 ${teacherId} の管理者判定完了（manager_ids未定義） ===`);
    return false;
  }
  
  try {
    let managerIds = locationInfo.manager_ids;
    console.log('locationInfo.manager_ids生データ:', managerIds, '型:', typeof managerIds);
    
    if (typeof managerIds === 'string') {
      // カンマ区切りの文字列の場合は配列に変換
      if (managerIds.includes(',')) {
        managerIds = managerIds.split(',').map(id => id.trim());
        console.log('カンマ区切り文字列から変換:', managerIds);
      } else {
        managerIds = JSON.parse(managerIds);
        console.log('JSONパース結果:', managerIds);
      }
    }
    
    console.log('処理後のmanagerIds:', managerIds, '型:', typeof managerIds, '配列か:', Array.isArray(managerIds));
    
    let isManager = false;
    if (Array.isArray(managerIds)) {
      console.log('配列として管理者判定を実行:');
      managerIds.forEach((id, index) => {
        const idNum = Number(id);
        const teacherIdNum = Number(teacherId);
        const isMatch = idNum === teacherIdNum;
        console.log(`  比較${index + 1}: ${id} (${typeof id}) == ${teacherId} (${typeof teacherId}) = ${isMatch}`);
        if (isMatch) {
          isManager = true;
        }
      });
    } else {
      const managerIdNum = Number(managerIds);
      const teacherIdNum = Number(teacherId);
      isManager = managerIdNum === teacherIdNum;
      console.log('単一値として管理者判定:', managerIdNum, '==', teacherIdNum, '=', isManager);
    }
    
    console.log(`最終的な管理者判定結果: ${isManager}`);
          console.log(`=== 指導員 ${teacherId} の管理者判定完了（locationInfo使用） ===`);
    return isManager;
  } catch (e) {
    console.error('管理者IDチェックエラー:', e);
          console.log(`=== 指導員 ${teacherId} の管理者判定完了（エラー） ===`);
    return false;
  }
};
