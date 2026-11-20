import ExcelJS from 'exceljs';

export async function downloadHomeSupportExcel({ user, records, fileName, placeWeeklyLast = false }) {

      // 新しいワークブックを作成
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('在宅支援記録');

      // テンプレートファイルを読み込む
      const titleTemplatePath = '/doc/reports/title_template.xlsx';
      const dailyTemplatePath = '/doc/reports/daily_report_template.xlsx';
      const weeklyTemplatePath = '/doc/reports/weekly_report_template.xlsx';

      // タイトルテンプレートを読み込む
      const titleResponse = await fetch(titleTemplatePath);
      if (!titleResponse.ok) {
        throw new Error('タイトルテンプレートファイルの読み込みに失敗しました');
      }
      const titleWorkbook = new ExcelJS.Workbook();
      await titleWorkbook.xlsx.load(await titleResponse.arrayBuffer());
      const titleSheet = titleWorkbook.getWorksheet(1) || titleWorkbook.worksheets[0];

      // 日次支援記録テンプレートを読み込む
      const dailyResponse = await fetch(dailyTemplatePath);
      if (!dailyResponse.ok) {
        throw new Error('日次支援記録テンプレートファイルの読み込みに失敗しました');
      }
      const dailyWorkbook = new ExcelJS.Workbook();
      await dailyWorkbook.xlsx.load(await dailyResponse.arrayBuffer());
      const dailySheet = dailyWorkbook.getWorksheet(1) || dailyWorkbook.worksheets[0];

      // 週次評価テンプレートを読み込む
      const weeklyResponse = await fetch(weeklyTemplatePath);
      if (!weeklyResponse.ok) {
        throw new Error('週次評価テンプレートファイルの読み込みに失敗しました');
      }
      const weeklyWorkbook = new ExcelJS.Workbook();
      await weeklyWorkbook.xlsx.load(await weeklyResponse.arrayBuffer());
      const weeklySheet = weeklyWorkbook.getWorksheet(1) || weeklyWorkbook.worksheets[0];

      // 列幅をコピーする関数
      const copyColumnWidths = (sourceSheet, targetSheet) => {
        try {
          // ソースシートの全列を走査して列幅をコピー
          // columnCountが利用できない場合は、実際に使用されている列を走査
          const maxCols = sourceSheet.columnCount || 100; // デフォルトで100列までチェック
          
          for (let col = 1; col <= maxCols; col++) {
            try {
              const sourceColumn = sourceSheet.getColumn(col);
              if (sourceColumn && sourceColumn.width) {
                const targetColumn = targetSheet.getColumn(col);
                targetColumn.width = sourceColumn.width;
              }
            } catch (e) {
              // 列が存在しない場合はスキップ
              break;
            }
          }
        } catch (e) {
          console.warn(`列幅のコピーに失敗: ${e.message}`);
        }
      };

      // 行をコピーする関数（列幅とマージセルも含む）
      const copyRow = (sourceSheet, sourceRowNum, targetSheet, targetRowNum) => {
        const sourceRow = sourceSheet.getRow(sourceRowNum);
        const targetRow = targetSheet.getRow(targetRowNum);

        // 行の高さをコピー
        if (sourceRow.height) {
          targetRow.height = sourceRow.height;
        }

        // セルをコピー
        sourceRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const targetCell = targetRow.getCell(colNumber);
          
          // 値のコピー
          if (cell.value !== null && cell.value !== undefined) {
            if (typeof cell.value === 'object' && cell.value.richText) {
              targetCell.value = { richText: cell.value.richText };
            } else {
              targetCell.value = cell.value;
            }
          }

          // スタイルの完全なコピー（罫線を含む）
          if (cell.style) {
            try {
              // ExcelJSのスタイルオブジェクトを直接コピー
              targetCell.style = JSON.parse(JSON.stringify(cell.style));
            } catch (e) {
              // フォールバック: 個別にコピー
              try {
                if (cell.style.font) targetCell.style.font = cell.style.font;
                if (cell.style.alignment) targetCell.style.alignment = cell.style.alignment;
                if (cell.style.border) targetCell.style.border = cell.style.border;
                if (cell.style.fill) targetCell.style.fill = cell.style.fill;
                if (cell.style.numFmt) targetCell.style.numFmt = cell.style.numFmt;
              } catch (e2) {
                console.warn(`スタイルのコピーに失敗: ${e2.message}`);
              }
            }
          }

          // 数式のコピー
          if (cell.formula) {
            targetCell.formula = cell.formula;
          }

          // コメントのコピー
          if (cell.note) {
            targetCell.note = cell.note;
          }
        });
      };

      // マージセルをコピーする関数（完全なコピー）
      const copyMergedCells = (sourceSheet, sourceStartRow, sourceEndRow, targetSheet, targetStartRow) => {
        try {
          const rowDiff = targetStartRow - sourceStartRow;
          
          // 方法1: worksheet.model.mergesから取得
          const modelMerges = sourceSheet.model?.merges || [];
          
          // 方法2: 各行を走査してマージセル情報を収集
          const collectedMerges = [];
          
          for (let row = sourceStartRow; row <= sourceEndRow; row++) {
            const sourceRow = sourceSheet.getRow(row);
            const seenCells = new Set();
            
            sourceRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
              const cellKey = `${row}-${colNumber}`;
              if (seenCells.has(cellKey)) return;
              seenCells.add(cellKey);
              
              try {
                // マージセルの情報を取得
                if (cell.isMerged) {
                  const master = cell.master || cell;
                  
                  // マージ範囲を取得（左上から右下まで）
                  let masterRow = master.row;
                  let masterCol = master.col;
                  
                  // マージ範囲を探す
                  let mergeBottom = masterRow;
                  let mergeRight = masterCol;
                  
                  // マージ範囲を探す（適切な範囲に限定）
                  const maxRows = Math.min(sourceEndRow + 10, sourceSheet.rowCount || sourceEndRow + 10);
                  const maxCols = Math.min(30, sourceSheet.columnCount || 30); // 最大30列まで
                  
                  for (let r = masterRow; r <= maxRows; r++) {
                    let foundInRow = false;
                    for (let c = masterCol; c <= maxCols; c++) {
                      try {
                        const testCell = sourceSheet.getRow(r).getCell(c);
                        if (testCell.isMerged && testCell.master && 
                            testCell.master.address === master.address) {
                          mergeBottom = Math.max(mergeBottom, r);
                          mergeRight = Math.max(mergeRight, c);
                          foundInRow = true;
                        }
                      } catch (e) {
                        break; // この列は範囲外
                      }
                    }
                    if (!foundInRow && r > masterRow) {
                      // この行にマージセルが見つからなければ終了
                      break;
                    }
                  }
                  
                  // マージ範囲を記録（重複を避ける）
                  const mergeKey = `${masterRow}-${masterCol}-${mergeBottom}-${mergeRight}`;
                  if (!collectedMerges.find(m => m.key === mergeKey)) {
                    collectedMerges.push({
                      key: mergeKey,
                      top: masterRow,
                      left: masterCol,
                      bottom: mergeBottom,
                      right: mergeRight
                    });
                  }
                }
              } catch (e) {
                // エラーは無視して続行
              }
            });
          }
          
          // すべてのマージセルを結合
          const allMerges = [];
          
          // model.mergesから取得
          if (modelMerges.length > 0) {
            modelMerges.forEach(merge => {
              try {
                let mergeTop, mergeLeft, mergeBottom, mergeRight;
                
                if (typeof merge === 'string') {
                  const parts = merge.split(':');
                  if (parts.length === 2) {
                    const startCell = sourceSheet.getCell(parts[0]);
                    const endCell = sourceSheet.getCell(parts[1]);
                    mergeTop = startCell.row;
                    mergeLeft = startCell.col;
                    mergeBottom = endCell.row;
                    mergeRight = endCell.col;
                  } else {
                    return;
                  }
                } else if (merge.top !== undefined) {
                  mergeTop = merge.top + 1;
                  mergeLeft = merge.left + 1;
                  mergeBottom = merge.bottom + 1;
                  mergeRight = merge.right + 1;
                } else if (merge.s && merge.e) {
                  mergeTop = merge.s.r + 1;
                  mergeLeft = merge.s.c + 1;
                  mergeBottom = merge.e.r + 1;
                  mergeRight = merge.e.c + 1;
                } else {
                  return;
                }
                
                if (mergeTop >= sourceStartRow && mergeTop <= sourceEndRow) {
                  allMerges.push({ top: mergeTop, left: mergeLeft, bottom: mergeBottom, right: mergeRight });
                }
              } catch (e) {
                // エラーは無視
              }
            });
          }
          
          // 収集したマージセルを追加
          collectedMerges.forEach(merge => {
            if (merge.top >= sourceStartRow && merge.top <= sourceEndRow) {
              allMerges.push({ top: merge.top, left: merge.left, bottom: merge.bottom, right: merge.right });
            }
          });
          
          // マージセルをコピー
          allMerges.forEach((merge, index) => {
            try {
              const newTop = merge.top + rowDiff;
              const newBottom = merge.bottom + rowDiff;
              const newLeft = merge.left;
              const newRight = merge.right;
              
              // マージセルをコピー
              try {
                targetSheet.mergeCells(newTop, newLeft, newBottom, newRight);
                
                // マージセルの罫線を設定（Y列まで）
                if (newRight >= 25) {
                  const topCell = targetSheet.getCell(newTop, newRight);
                  topCell.style = topCell.style || {};
                  topCell.style.border = topCell.style.border || {};
                  topCell.style.border.right = {
                    style: 'thin',
                    color: { argb: 'FF000000' }
                  };
                }
              } catch (mergeError) {
                // 既にマージされている場合はスキップ
                if (!mergeError.message || !mergeError.message.includes('already merged')) {
                  console.warn(`マージセルのコピーに失敗: ${mergeError.message || mergeError}`, {
                    newTop, newLeft, newBottom, newRight,
                    original: merge
                  });
                }
              }
            } catch (e) {
              console.warn(`マージセルの処理に失敗: ${e.message}`, merge);
            }
          });
        } catch (e) {
          console.warn(`マージセルコピー処理エラー: ${e.message}`);
        }
      };

      // 日付を和暦に変換する関数
      const convertToWareki = (westernYear, month = 1, day = 1) => {
        const reiwaStartDate = new Date(2019, 4, 1);
        const targetDate = new Date(westernYear, month - 1, day);
        
        if (targetDate < reiwaStartDate) {
          const heiseiStartDate = new Date(1989, 0, 8);
          if (targetDate >= heiseiStartDate) {
            const heiseiYear = westernYear - 1988;
            return { era: '平成', year: heiseiYear, month, day };
          }
          return { era: '昭和', year: westernYear - 1925, month, day };
        }
        
        const reiwaYear = westernYear - 2018;
        return { era: '令和', year: reiwaYear, month, day };
      };

      const formatDateParts = (dateStr) => {
        if (!dateStr) return { era: '令和', year: '', month: '', day: '' };
        const date = new Date(dateStr);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return convertToWareki(year, month, day);
      };

      // 時間をフォーマットする関数
      const formatTime = (datetimeStr) => {
        if (!datetimeStr) return '';
        const date = new Date(datetimeStr);
        return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
      };

      // 最初に列幅をコピー（タイトルテンプレートから）
      copyColumnWidths(titleSheet, worksheet);

      let currentRow = 1;
      let reportCount = 0; // 現在のページの報告書数（タイトルを含む）

      const recordTime = (record) => {
        const value = record.type === 'daily' ? record.date : (record.period_end || record.date);
        const time = new Date(value).getTime();
        return Number.isNaN(time) ? 0 : time;
      };
      const sortedRecords = [...records].sort((a, b) => {
        if (placeWeeklyLast && a.type !== b.type) {
          return a.type === 'daily' ? -1 : 1;
        }
        const dateDiff = recordTime(a) - recordTime(b);
        if (dateDiff === 0) {
          if (a.type === 'daily' && b.type === 'weekly') return -1;
          if (a.type === 'weekly' && b.type === 'daily') return 1;
        }
        return dateDiff;
      });

      for (let i = 0; i < sortedRecords.length; i++) {
        const record = sortedRecords[i];

        // 改ページ処理（タイトル＋報告書2つ＝計3つで改ページ）
        if (reportCount >= 3) {
          // 改ページマーカーを設定
          const prevRow = worksheet.getRow(currentRow - 1);
          if (prevRow) {
            prevRow.pageBreak = true;
          }
          // 空行を追加
          currentRow++;
          reportCount = 0;
        }

          // タイトルをコピー（1～2行目）
          if (reportCount === 0) {
            const titleStartRow = currentRow;
            copyRow(titleSheet, 1, worksheet, currentRow);
            currentRow++;
            copyRow(titleSheet, 2, worksheet, currentRow);
            
            // マージセルをコピー（1～2行目）
            copyMergedCells(titleSheet, 1, 2, worksheet, titleStartRow);
            
            // マージセルが正しくコピーされたか再確認し、必要に応じて再適用
            try {
              const templateMerges = titleSheet.model?.merges || [];
              templateMerges.forEach(merge => {
                try {
                  let mergeTop, mergeLeft, mergeBottom, mergeRight;
                  
                  if (typeof merge === 'string') {
                    const parts = merge.split(':');
                    if (parts.length === 2) {
                      const startCell = titleSheet.getCell(parts[0]);
                      const endCell = titleSheet.getCell(parts[1]);
                      mergeTop = startCell.row;
                      mergeLeft = startCell.col;
                      mergeBottom = endCell.row;
                      mergeRight = endCell.col;
                    } else {
                      return;
                    }
                  } else if (merge.top !== undefined) {
                    mergeTop = merge.top + 1;
                    mergeLeft = merge.left + 1;
                    mergeBottom = merge.bottom + 1;
                    mergeRight = merge.right + 1;
                  } else if (merge.s && merge.e) {
                    mergeTop = merge.s.r + 1;
                    mergeLeft = merge.s.c + 1;
                    mergeBottom = merge.e.r + 1;
                    mergeRight = merge.e.c + 1;
                  } else {
                    return;
                  }
                  
                  if (mergeTop >= 1 && mergeTop <= 2) {
                    const newTop = mergeTop + titleStartRow - 1;
                    const newBottom = mergeBottom + titleStartRow - 1;
                    const newLeft = mergeLeft;
                    const newRight = mergeRight;
                    
                    try {
                      worksheet.mergeCells(newTop, newLeft, newBottom, newRight);
                    } catch (e) {
                      // 既にマージされている場合はスキップ
                    }
                  }
                } catch (e) {
                  // エラーは無視
                }
              });
            } catch (e) {
              console.warn('タイトルマージセルの再適用エラー:', e.message);
            }
            
            // 対象者名と受給者証番号を入力（D列とQ列に直接設定）
            // D列に対象者名を設定
            const nameCell = worksheet.getCell(currentRow, 4); // D列
            if (user.name) {
              nameCell.value = user.name;
            }
            
            // Q列に受給者証番号を設定
            const recipientCell = worksheet.getCell(currentRow, 17); // Q列
            if (user.recipient_number) {
              recipientCell.value = user.recipient_number;
            }
            
            currentRow++;
            // 1行空ける
            currentRow++;
            reportCount++;
          }

        // 記録を処理
        if (record.type === 'daily') {
          // 日次支援記録：1～16行目をコピー
          const dailyStartRow = currentRow;
          for (let row = 1; row <= 16; row++) {
            copyRow(dailySheet, row, worksheet, currentRow);
            currentRow++;
          }
          
          // マージセルをコピー（1～16行目）- 行をコピーした後に実行
          copyMergedCells(dailySheet, 1, 16, worksheet, dailyStartRow);
          
          // マージセルが正しくコピーされたか再確認し、必要に応じて再適用
          // テンプレートのマージセル情報を直接確認
          try {
            const templateMerges = dailySheet.model?.merges || [];
            templateMerges.forEach(merge => {
              try {
                let mergeTop, mergeLeft, mergeBottom, mergeRight;
                
                if (typeof merge === 'string') {
                  const parts = merge.split(':');
                  if (parts.length === 2) {
                    const startCell = dailySheet.getCell(parts[0]);
                    const endCell = dailySheet.getCell(parts[1]);
                    mergeTop = startCell.row;
                    mergeLeft = startCell.col;
                    mergeBottom = endCell.row;
                    mergeRight = endCell.col;
                  } else {
                    return;
                  }
                } else if (merge.top !== undefined) {
                  mergeTop = merge.top + 1;
                  mergeLeft = merge.left + 1;
                  mergeBottom = merge.bottom + 1;
                  mergeRight = merge.right + 1;
                } else if (merge.s && merge.e) {
                  mergeTop = merge.s.r + 1;
                  mergeLeft = merge.s.c + 1;
                  mergeBottom = merge.e.r + 1;
                  mergeRight = merge.e.c + 1;
                } else {
                  return;
                }
                
                if (mergeTop >= 1 && mergeTop <= 16) {
                  const newTop = mergeTop + dailyStartRow - 1;
                  const newBottom = mergeBottom + dailyStartRow - 1;
                  const newLeft = mergeLeft;
                  const newRight = mergeRight;
                  
                  try {
                    worksheet.mergeCells(newTop, newLeft, newBottom, newRight);
                  } catch (e) {
                    // 既にマージされている場合はスキップ
                  }
                }
              } catch (e) {
                // エラーは無視
              }
            });
          } catch (e) {
            console.warn('マージセルの再適用エラー:', e.message);
          }
          
          // データを埋め込む（実施日の行を探す）
          const dateParts = formatDateParts(record.date);
          
          // 実施日の行（通常は3行目、または「実施」という文字列がある行）を探す
          for (let row = dailyStartRow; row < dailyStartRow + 16; row++) {
            const rowObj = worksheet.getRow(row);
            let foundDateRow = false;
            
            rowObj.eachCell({ includeEmpty: true }, (cell, colNumber) => {
              const cellValue = cell.value?.toString() || '';
              
              // 「実施」という文字列がある行を見つける
              if (cellValue.includes('実施') && !foundDateRow) {
                foundDateRow = true;
                
                // 実施日のセルを探して値を設定
                // D列に和暦（年号＋数字、例：令和6）
                const eraCell = worksheet.getCell(row, 4); // D列
                // 既存の値がある場合は上書きしない（テンプレートの値がある場合）
                if (eraCell.value === null || eraCell.value === '') {
                  eraCell.value = `${dateParts.era}${dateParts.year}`;
                  // 文字サイズを小さくして1行に収める
                  eraCell.style = eraCell.style || {};
                  eraCell.style.font = eraCell.style.font || {};
                  eraCell.style.font.size = 9; // フォントサイズを9ptに設定
                }
                
                // I列に月
                const monthCell = worksheet.getCell(row, 9); // I列
                if (monthCell.value === null || monthCell.value === '') {
                  monthCell.value = dateParts.month;
                }
                
                // L列に日
                const dayCell = worksheet.getCell(row, 12); // L列
                if (dayCell.value === null || dayCell.value === '') {
                  dayCell.value = dateParts.day;
                }
                
                // Q列に始業時間
                if (record.mark_start) {
                  const startTime = formatTime(record.mark_start);
                  const startTimeCell = worksheet.getCell(row, 17); // Q列
                  if (startTimeCell.value === null || startTimeCell.value === '') {
                    startTimeCell.value = startTime;
                  }
                }
                
                // V列に終業時間
                if (record.mark_end) {
                  const endTime = formatTime(record.mark_end);
                  const endTimeCell = worksheet.getCell(row, 22); // V列
                  if (endTimeCell.value === null || endTimeCell.value === '') {
                    endTimeCell.value = endTime;
                  }
                }
              }
              
              // 支援方法の処理（訪問・電話・その他のみ）
              if (cellValue.includes('支援方法')) {
                // support_methodフィールドを確認（DBから取得された値）
                const supportMethod = record.support_method || record.supportMethod;
                
                if (supportMethod) {
                  // 支援方法の選択肢を探して、該当する方法の左隣のセルに✓を入れる
                  // まず「支援方法」の行全体を走査
                  for (let searchCol = colNumber + 1; searchCol <= colNumber + 15; searchCol++) {
                    try {
                      const methodCell = worksheet.getCell(row, searchCol);
                      const methodValue = methodCell.value?.toString() || '';
                      
                      // 訪問の場合
                      if (supportMethod === '訪問' && methodValue.includes('訪問')) {
                        const checkCell = worksheet.getCell(row, searchCol - 1);
                        checkCell.value = '✓';
                        break;
                      }
                      // 電話の場合
                      else if (supportMethod === '電話' && methodValue.includes('電話')) {
                        const checkCell = worksheet.getCell(row, searchCol - 1);
                        checkCell.value = '✓';
                        break;
                      }
                      // その他の場合
                      else if (supportMethod === 'その他' && methodValue.includes('その他')) {
                        const checkCell = worksheet.getCell(row, searchCol - 1);
                        checkCell.value = '✓';
                        const note = record.support_method_note || record.supportMethodNote;
                        if (note) {
                          // その他の詳細を（）内に入力
                          // 「その他」の次のセルに「（詳細内容）」の形式で入力
                          const noteCell = worksheet.getCell(row, searchCol + 1);
                          noteCell.value = `（${note}）`;
                        }
                        break;
                      }
                    } catch (e) {
                      // セルが存在しない場合はスキップ
                      continue;
                    }
                  }
                }
              }
              
              // 作業・訓練内容の処理（D列から開始）
              if ((cellValue.includes('作業') && cellValue.includes('訓練')) || cellValue.includes('作業内容') || cellValue.includes('訓練内容')) {
                const workContent = record.task_content || record.workContent || record.work_result || record.workResult;
                if (workContent) {
                  // D列（4列目）から開始
                  const contentCell = worksheet.getCell(row, 4); // D列
                  if (contentCell.value === null || contentCell.value === '') {
                    contentCell.value = workContent;
                    contentCell.font = { ...(contentCell.font || {}), size: 10 };
                  }
                }
              }
              
              // 支援内容の処理（日報テンプレートをコピーした先頭行から4行目のD列に入力）
              // コピーした頭のセル＋4のD列（4行目に日報テンプレートをコピーしたら8行目）
              if (record.support_content) {
                const supportContentRow = dailyStartRow + 4; // 先頭行から5行目（+4で、コピー先が4行目なら8行目）
                if (supportContentRow < dailyStartRow + 16) {
                  // D列のセルを取得
                  let supportContentCell = worksheet.getCell(supportContentRow, 4); // D列
                  
                  // セルがマージセルの一部かどうか確認し、左上のセルを取得
                  try {
                    // マージセルの場合、左上のセルを取得
                    if (supportContentCell.isMerged) {
                      const master = supportContentCell.master;
                      if (master) {
                        supportContentCell = master;
                      }
                    }
                  } catch (e) {
                    // エラーは無視してそのまま使用
                  }
                  
                  supportContentCell.value = record.support_content;
                  supportContentCell.font = { ...(supportContentCell.font || {}), size: 10 };
                }
              }
              
              // 健康状態・助言の処理（D列から開始）
              if (cellValue.includes('健康') || cellValue.includes('助言') || cellValue.includes('心身')) {
                if (record.advice) {
                  // D列（4列目）から開始
                  const contentCell = worksheet.getCell(row, 4); // D列
                  if (contentCell.value === null || contentCell.value === '') {
                    contentCell.value = record.advice;
                    contentCell.font = { ...(contentCell.font || {}), size: 10 };
                  }
                }
              }
              
              // 記録者の処理（D列から開始）
              if (cellValue.includes('記録者') || cellValue.includes('対応')) {
                if (record.recorder_name) {
                  // D列（4列目）から開始
                  const contentCell = worksheet.getCell(row, 4); // D列
                  if (contentCell.value === null || contentCell.value === '') {
                    contentCell.value = record.recorder_name;
                  }
                }
              }
            });
          }
          
          // 1行空ける
          currentRow++;
          reportCount++;
        } else if (record.type === 'weekly') {
          // 週次評価：1～15行目をコピー
          const weeklyStartRow = currentRow;
          for (let row = 1; row <= 15; row++) {
            copyRow(weeklySheet, row, worksheet, currentRow);
            currentRow++;
          }
          
          // マージセルをコピー（1～15行目）
          copyMergedCells(weeklySheet, 1, 15, worksheet, weeklyStartRow);
          
          // マージセルが正しくコピーされたか再確認し、必要に応じて再適用
          try {
            const templateMerges = weeklySheet.model?.merges || [];
            templateMerges.forEach(merge => {
              try {
                let mergeTop, mergeLeft, mergeBottom, mergeRight;
                
                if (typeof merge === 'string') {
                  const parts = merge.split(':');
                  if (parts.length === 2) {
                    const startCell = weeklySheet.getCell(parts[0]);
                    const endCell = weeklySheet.getCell(parts[1]);
                    mergeTop = startCell.row;
                    mergeLeft = startCell.col;
                    mergeBottom = endCell.row;
                    mergeRight = endCell.col;
                  } else {
                    return;
                  }
                } else if (merge.top !== undefined) {
                  mergeTop = merge.top + 1;
                  mergeLeft = merge.left + 1;
                  mergeBottom = merge.bottom + 1;
                  mergeRight = merge.right + 1;
                } else if (merge.s && merge.e) {
                  mergeTop = merge.s.r + 1;
                  mergeLeft = merge.s.c + 1;
                  mergeBottom = merge.e.r + 1;
                  mergeRight = merge.e.c + 1;
                } else {
                  return;
                }
                
                if (mergeTop >= 1 && mergeTop <= 15) {
                  const newTop = mergeTop + weeklyStartRow - 1;
                  const newBottom = mergeBottom + weeklyStartRow - 1;
                  const newLeft = mergeLeft;
                  const newRight = mergeRight;
                  
                  try {
                    worksheet.mergeCells(newTop, newLeft, newBottom, newRight);
                  } catch (e) {
                    // 既にマージされている場合はスキップ
                  }
                }
              } catch (e) {
                // エラーは無視
              }
            });
          } catch (e) {
            console.warn('マージセルの再適用エラー:', e.message);
          }
          
                    // データを埋め込む
          const startParts = record.period_start ? formatDateParts(record.period_start) : null;                                                                 
          const endParts = record.period_end ? formatDateParts(record.period_end) : null;
          const dateParts = record.date ? formatDateParts(record.date) : null;
          const prevEvalParts = record.prev_eval_date ? formatDateParts(record.prev_eval_date) : null;

          // テンプレート内の行番号を基準にデータを埋め込む
          // テンプレートは15行なので、テンプレート内の行番号を使用
          // 実施日・前回評価日：テンプレート内の2行目（weeklyStartRow + 1）
          const dateRow = weeklyStartRow + 1;
          
          // 実施日：D列（和暦年号＋年）、I列（月）、L列（日）
          if (dateParts) {
            const eraCell = worksheet.getCell(dateRow, 4); // D列：和暦年号＋年
            eraCell.value = `${dateParts.era}${dateParts.year}`;
            // フォントサイズを10ptに設定
            eraCell.style = eraCell.style || {};
            eraCell.style.font = eraCell.style.font || {};
            eraCell.style.font.size = 10;
            worksheet.getCell(dateRow, 9).value = dateParts.month; // I列：月
            worksheet.getCell(dateRow, 12).value = dateParts.day; // L列：日
          }
          
          // 前回評価日：S列（和暦年号＋年）、V列（月）、X列（日）
          if (prevEvalParts) {
            worksheet.getCell(dateRow, 19).value = `${prevEvalParts.era}${prevEvalParts.year}`; // S列：和暦年号＋年
            worksheet.getCell(dateRow, 22).value = prevEvalParts.month; // V列：月
            worksheet.getCell(dateRow, 24).value = prevEvalParts.day; // X列：日
          }
          
          // 方法：テンプレート内の3行目（weeklyStartRow + 2）
          // 通所：D列、訪問：G列、その他：J列、その他の備考：N列
          const methodRow = weeklyStartRow + 2;
          if (record.evaluation_method) {
            if (record.evaluation_method === '通所') {
              worksheet.getCell(methodRow, 4).value = '✓'; // D列
            } else if (record.evaluation_method === '訪問') {
              worksheet.getCell(methodRow, 7).value = '✓'; // G列
            } else if (record.evaluation_method === 'その他') {
              worksheet.getCell(methodRow, 10).value = '✓'; // J列
              if (record.method_other) {
                // その他の説明はN列
                worksheet.getCell(methodRow, 14).value = record.method_other;
              }
            }
          }
          
          // 対象期間：テンプレート内の4行目（weeklyStartRow + 3）
          // 開始日：D列（和暦年号＋年）、G列（月）、I列（日）
          // 終了日：L列（和暦年号＋年）、O列（月）、Q列（日）
          const periodRow = weeklyStartRow + 3;
          if (startParts) {
            worksheet.getCell(periodRow, 4).value = `${startParts.era}${startParts.year}`; // D列：開始和暦年号＋年
            worksheet.getCell(periodRow, 7).value = startParts.month; // G列：開始月
            worksheet.getCell(periodRow, 9).value = startParts.day; // I列：開始日
          }
          if (endParts) {
            worksheet.getCell(periodRow, 12).value = `${endParts.era}${endParts.year}`; // L列：終了和暦年号＋年
            worksheet.getCell(periodRow, 15).value = endParts.month; // O列：終了月
            worksheet.getCell(periodRow, 17).value = endParts.day; // Q列：終了日
          }
          
          // 評価内容：テンプレート内の6行目（weeklyStartRow + 5）のA列から
          const contentRow = weeklyStartRow + 5;
          if (record.evaluation_content) {
            worksheet.getCell(contentRow, 1).value = record.evaluation_content; // A列
          }
          
          // 記録者・確認者：テンプレート内の17行目（weeklyStartRow + 16）
          // ただし、テンプレートが15行なので、記録者の行を探す
          // テンプレート内で「記録者」という文字列がある行を探す
          for (let row = weeklyStartRow; row < weeklyStartRow + 15; row++) {
            const rowObj = worksheet.getRow(row);
            let foundRecorder = false;
            
            rowObj.eachCell({ includeEmpty: true }, (cell, colNumber) => {
              const cellValue = cell.value?.toString() || '';
              
              if (cellValue.includes('記録者') && !foundRecorder) {
                foundRecorder = true;
                // 記録者名をE列に設定
                if (record.recorder_name) {
                  worksheet.getCell(row, 5).value = record.recorder_name; // E列
                }
                // 確認者名をT列（R列の2列右）に設定（記録者と同じ行のR列）
                if (record.confirm_name) {
                  worksheet.getCell(row, 18).value = record.confirm_name; // R列
                }
              }
            });
            
            if (foundRecorder) break;
          }
          
          // 1行空ける
          currentRow++;
          reportCount++;
        }
      }

      // A4縦型のページ設定
      worksheet.pageSetup = {
        paperSize: 9, // A4
        orientation: 'portrait', // 縦型
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0
      };
      
      // 改行位置をY列（25列目）に設定
      // 列の幅を調整してY列まで表示できるようにする
      for (let col = 1; col <= 25; col++) {
        const column = worksheet.getColumn(col);
        if (!column.width) {
          column.width = 10; // デフォルト幅を設定
        }
      }
      
      // Y列（25列目）の右側に罫線を設定し、結合セル以外のwrapTextを外す
      worksheet.eachRow((row, rowNumber) => {
        const yColumnCell = row.getCell(25); // Y列（25列目）
        if (yColumnCell) {
          // スタイルを確実に設定
          yColumnCell.style = yColumnCell.style || {};
          yColumnCell.style.border = yColumnCell.style.border || {};
          yColumnCell.style.border.right = yColumnCell.style.border.right || {
            style: 'thin',
            color: { argb: 'FF000000' }
          };
          
          // Y列は結合セルの可能性があるので、結合セルの場合はwrapTextを有効にする
          if (yColumnCell.isMerged) {
            yColumnCell.style.alignment = yColumnCell.style.alignment || {};
            yColumnCell.style.alignment.wrapText = true;
          } else {
            yColumnCell.style.alignment = yColumnCell.style.alignment || {};
            yColumnCell.style.alignment.wrapText = false;
          }
        }
        
        // 他のセルも処理（結合セルのみwrapTextを有効にする）
        row.eachCell((cell, colNumber) => {
          cell.style = cell.style || {};
          cell.style.alignment = cell.style.alignment || {};
          
          // 結合セルかどうかを確認
          if (cell.isMerged) {
            // 結合セルの場合はwrapTextを有効にする
            cell.style.alignment.wrapText = true;
          } else {
            // 結合セル以外はwrapTextを無効にする
            cell.style.alignment.wrapText = false;
          }
        });
      });

      // Excelファイルをダウンロード
      const excelBuffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const downloadName = fileName;
      link.download = downloadName;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
}
