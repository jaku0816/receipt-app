import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Camera, 
  FileText, 
  Trash2, 
  AlertCircle,
  Download,
  Loader2,
  FolderPlus,
  Edit2,
  Maximize2,
  AlertTriangle,
  Save,
  X,
  Calendar,
  PieChart,
  RefreshCw,
  Settings,
  CloudUpload,
  CheckCircle2
} from 'lucide-react';

const App = () => {
  const [receipts, setReceipts] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  const [notification, setNotification] = useState(null);
  
  const [editingItem, setEditingItem] = useState(null);
  const [enlargedImage, setEnlargedImage] = useState(null);
  const fileInputRef = useRef(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleToken, setGoogleToken] = useState(null);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);

  const currentMonthStr = new Date().toISOString().substring(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    const savedClientId = localStorage.getItem('googleClientId');
    if (savedClientId) setGoogleClientId(savedClientId);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    const duration = type === 'error' ? 8000 : 3000;
    setTimeout(() => setNotification(null), duration);
  };

  const handleGoogleLogin = () => {
    if (!googleClientId) {
      showNotification("請先輸入 Google Client ID", "error");
      return;
    }
    if (!window.google) {
      showNotification("Google 服務載入中，請稍後再試", "error");
      return;
    }
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (tokenResponse) => {
          if (tokenResponse && tokenResponse.access_token) {
            setGoogleToken(tokenResponse.access_token);
            localStorage.setItem('googleClientId', googleClientId);
            setIsSettingsOpen(false);
            showNotification("Google Drive 連線成功！");
          }
        },
      });
      client.requestAccessToken();
    } catch (error) {
      console.error(error);
      showNotification("登入失敗，請檢查 Client ID", "error");
    }
  };

  const base64ToBlob = (b64Data, contentType = 'image/png') => {
    const byteCharacters = atob(b64Data.split(',')[1]);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: contentType });
  };

  const backupToDrive = async (receiptId) => {
    if (!googleToken) {
      showNotification("請先連接 Google Drive", "error");
      setIsSettingsOpen(true);
      return;
    }

    const targetReceipt = receipts.find(r => r.id === receiptId);
    if (!targetReceipt) return;

    setIsUploadingToDrive(true);
    
    try {
      const mimeTypeMatch = targetReceipt.preview.match(/data:([^;]+);/);
      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';
      const fileBlob = base64ToBlob(targetReceipt.preview, mimeType);
      
      const fileExt = mimeType === 'image/png' ? 'png' : 'jpg';
      const fileName = `${targetReceipt.date}_${targetReceipt.vendor}_$${targetReceipt.amount}.${fileExt}`;
      
      const metadata = { name: fileName, mimeType: mimeType };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', fileBlob);

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${googleToken}` },
        body: form
      });

      if (response.ok) {
        setReceipts(receipts.map(r => r.id === receiptId ? { ...r, driveSynced: true } : r));
        showNotification("相片已成功備份至 Drive", "success");
      } else {
        throw new Error("上傳失敗");
      }
    } catch (error) {
      console.error(error);
      showNotification("備份失敗，請檢查網路或重新授權", "error");
      setGoogleToken(null);
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  const processImageWithAI = async (base64Image) => {
    try {
      const prompt = `Analyze this receipt image and extract the following information. Return ONLY a valid JSON object matching this schema exactly:
      {
        "date": "YYYY-MM-DD",
        "amount": number,
        "currency": "string",
        "category": "F&B" | "Transport" | "Office" | "Utility" | "Other",
        "vendor": "string"
      }`;
      
      const mimeTypeMatch = base64Image.match(/data:([^;]+);/);
      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/jpeg";
      const base64Data = base64Image.split(',')[1];

      const modelName = "gemini-1.5-flash";
      
      // 直接呼叫後端 API，不再需要傳遞 API Key
      const requestUrl = `/api/gemini?model=${modelName}`;

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ 
            parts: [
              { text: prompt }, 
              { inlineData: { mimeType: mimeType, data: base64Data } }
            ] 
          }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP ${response.status}`);
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) throw new Error("AI 回傳了空白內容");

      const cleanedJson = text.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanedJson);
    } catch (error) {
      console.error("OCR Error Detail:", error.message);
      return { _error: error.message }; 
    }
  };

  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
          resolve(compressedBase64);
        };
        img.onerror = () => reject(new Error("圖片載入失敗"));
      };
      reader.onerror = () => reject(new Error("讀取圖片失敗"));
    });
  };

  const handleFileUpload = async (event) => {
    const allFiles = Array.from(event.target.files);
    if (allFiles.length === 0) return;

    const MAX_UPLOADS = 10;
    let filesToProcess = allFiles;
    
    if (allFiles.length > MAX_UPLOADS) {
      showNotification(`已選取 ${allFiles.length} 張相片。單次最多只處理 ${MAX_UPLOADS} 張。`, 'error');
      filesToProcess = allFiles.slice(0, MAX_UPLOADS);
    }

    setIsProcessing(true);
    const newReceipts = [];
    let currentReceipts = [...receipts];
    let duplicateCount = 0;

    for (const file of filesToProcess) {
      try {
        const compressedBase64 = await compressImage(file);
        const aiResult = await processImageWithAI(compressedBase64);

        if (aiResult && !aiResult._error) {
          const isDuplicate = currentReceipts.some(r => Number(r.amount) === Number(aiResult.amount) && r.date === aiResult.date);
          if (isDuplicate) duplicateCount++;

          const newItem = {
            id: Math.random().toString(36).substr(2, 9),
            file: file.name,
            preview: compressedBase64,
            ...aiResult,
            status: 'pending',
            isDuplicate: isDuplicate,
            driveSynced: false
          };
          newReceipts.push(newItem);
          currentReceipts.push(newItem);
        } else {
          const errMsg = aiResult?._error || "未知錯誤";
          showNotification(`AI 辨識失敗: ${errMsg}`, 'error');
          
          const fallbackItem = {
            id: Math.random().toString(36).substr(2, 9),
            file: file.name,
            preview: compressedBase64,
            date: new Date().toISOString().split('T')[0],
            amount: 0,
            category: '待分類',
            vendor: '辨識失敗 (請按編輯)',
            status: 'error',
            isDuplicate: false,
            driveSynced: false,
            errorDetail: errMsg 
          };
          newReceipts.push(fallbackItem);
          currentReceipts.push(fallbackItem);
        }
      } catch (err) {
        showNotification(`圖片處理發生錯誤: ${err.message}`, 'error');
      }
    }

    setReceipts(prev => [...newReceipts, ...prev]);
    setIsProcessing(false);
    
    if (duplicateCount > 0) {
      showNotification(`處理完成！但發現 ${duplicateCount} 張疑似重複的收據。`, 'error');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeEntry = (id) => {
    setReceipts(receipts.filter(r => r.id !== id));
    showNotification("已移除記錄", "info");
  };

  const removeAllDuplicates = () => {
    const filteredReceipts = receipts.filter(r => !r.isDuplicate);
    const removedCount = receipts.length - filteredReceipts.length;
    setReceipts(filteredReceipts);
    showNotification(`已一鍵移除 ${removedCount} 張重複收據`, "success");
  };

  const saveEdit = (id) => {
    setReceipts(receipts.map(r => r.id === id ? { ...editingItem, isDuplicate: false } : r));
    setEditingItem(null);
    showNotification("已更新記錄", "success");
  };

  const exportToCSV = (dataToExport = receipts, monthLabel = "全部") => {
    if (dataToExport.length === 0) return;
    const headers = ["日期", "商戶", "金額", "類別", "文件名", "Drive備份狀態"];
    const sortedData = [...dataToExport].sort((a, b) => new Date(a.date) - new Date(b.date));
    const rows = sortedData.map(r => [r.date, r.vendor, r.amount, r.category, r.file, r.driveSynced ? '已備份' : '未備份']);
    
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; 
    csvContent += headers.join(",") + "\n";
    rows.forEach(rowArray => { csvContent += rowArray.join(",") + "\n"; });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `會計對帳單_${monthLabel}_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const monthlyData = useMemo(() => {
    const groups = {};
    receipts.forEach(receipt => {
      const month = receipt.date ? receipt.date.substring(0, 7) : '未知日期'; 
      if (!groups[month]) groups[month] = { receipts: [], total: 0 };
      groups[month].receipts.push(receipt);
      groups[month].total += (Number(receipt.amount) || 0);
    });
    return Object.keys(groups).sort().reverse().map(month => ({
      month,
      receipts: groups[month].receipts.sort((a, b) => new Date(b.date) - new Date(a.date)),
      total: groups[month].total
    }));
  }, [receipts]);

  const currentMonthData = monthlyData.find(d => d.month === selectedMonth) || { receipts: [], total: 0 };
  const hasDuplicates = receipts.some(r => r.isDuplicate);

  const renderReceiptCard = (item) => (
    <div key={item.id} className={`bg-white p-3 rounded-xl shadow-sm border ${item.isDuplicate ? 'border-orange-400 bg-orange-50/50' : 'border-gray-100'} flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 transition-all`}>
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          {item.isDuplicate && (
            <div className="flex items-center gap-1 text-orange-700 text-xs font-bold bg-orange-100 w-fit px-2 py-0.5 rounded-md border border-orange-200">
              <AlertTriangle size={12} /><span>疑似重複</span>
            </div>
          )}
          {item.driveSynced && (
            <div className="flex items-center gap-1 text-green-700 text-xs font-bold bg-green-100 w-fit px-2 py-0.5 rounded-md border border-green-200">
              <CheckCircle2 size={12} /><span>已備份雲端</span>
            </div>
          )}
          {item.status === 'error' && (
            <div className="flex items-center gap-1 text-red-700 text-xs font-bold bg-red-100 w-fit px-2 py-0.5 rounded-md border border-red-200">
              <AlertCircle size={12} /><span>需手動補齊</span>
            </div>
          )}
        </div>
        
        {item.status === 'error' && item.errorDetail && (
          <div className="text-[10px] text-red-600 bg-red-50 p-1.5 rounded border border-red-100 break-words leading-tight mt-1">
            <strong>錯誤細節：</strong> {item.errorDetail}
          </div>
        )}
      </div>

      {editingItem?.id === item.id ? (
        <div className="flex flex-col gap-2">
          <input type="text" value={editingItem.vendor} onChange={e => setEditingItem({...editingItem, vendor: e.target.value})} className="p-2 border rounded-lg text-sm w-full font-bold focus:ring-2 focus:ring-blue-500 outline-none" placeholder="商戶名稱" />
          <div className="flex gap-2">
            <input type="date" value={editingItem.date} onChange={e => setEditingItem({...editingItem, date: e.target.value})} className="p-2 border rounded-lg text-xs flex-1 outline-none" />
            <select value={editingItem.category} onChange={e => setEditingItem({...editingItem, category: e.target.value})} className="p-2 border rounded-lg text-xs flex-1 outline-none bg-white">
              <option value="F&B">餐飲 (F&B)</option>
              <option value="Transport">交通 (Transport)</option>
              <option value="Office">辦公用品 (Office)</option>
              <option value="Utility">水電煤 (Utility)</option>
              <option value="Other">其他 (Other)</option>
            </select>
          </div>
          <div className="flex gap-2 items-center bg-gray-50 p-2 rounded-lg border">
            <span className="text-gray-500 font-bold ml-1">$</span>
            <input type="number" value={editingItem.amount} onChange={e => setEditingItem({...editingItem, amount: parseFloat(e.target.value) || 0})} className="p-1 bg-transparent text-lg flex-1 font-black text-blue-600 outline-none" step="0.1" />
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setEditingItem(null)} className="px-3 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg flex items-center gap-1 transition"><X size={16} /> 取消</button>
            <button onClick={() => saveEdit(item.id)} className="px-3 py-1.5 text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1 shadow-sm transition"><Save size={16} /> <span className="text-sm font-bold">儲存</span></button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 mt-1">
          <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 relative group cursor-pointer border border-gray-200" onClick={() => setEnlargedImage(item.preview)}>
            <img src={item.preview} alt="preview" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-40 transition-all flex items-center justify-center"><Maximize2 size={16} className="text-white opacity-0 group-hover:opacity-100" /></div>
          </div>
          <div className="flex-grow min-w-0">
            <div className="flex justify-between items-start">
              <p className={`font-bold truncate text-sm ${item.status === 'error' ? 'text-red-500' : 'text-gray-800'}`}>{item.vendor}</p>
              <div className="flex gap-1">
                <button onClick={() => setEditingItem(item)} className="p-1 text-gray-500 hover:text-blue-600 transition bg-white border border-gray-200 shadow-sm rounded"><Edit2 size={14} /></button>
                <button onClick={() => removeEntry(item.id)} className="p-1 text-gray-500 hover:text-red-500 transition bg-white border border-gray-200 shadow-sm rounded"><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="flex justify-between items-end mt-1">
              <div>
                <p className="text-xs text-gray-500">{item.date}</p>
                <span className="text-[10px] px-2 py-0.5 bg-gray-100 rounded text-gray-600 uppercase font-bold tracking-wider mt-1 inline-block">{item.category}</span>
              </div>
              <div className="flex flex-col items-end gap-1">
                <p className={`font-black text-lg ${item.isDuplicate ? 'text-orange-600' : 'text-blue-600'}`}>${item.amount}</p>
                {!item.driveSynced && !item.isDuplicate && item.status !== 'error' && (
                  <button onClick={() => backupToDrive(item.id)} disabled={isUploadingToDrive} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded-md font-bold flex items-center gap-1 hover:bg-blue-100 disabled:opacity-50"><CloudUpload size={12} /> 備份相片</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans pb-20 relative">
      <header className="bg-blue-600 text-white p-4 sticky top-0 z-10 shadow-md">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileText size={24} /> 小企收據管家
          </h1>
          <button onClick={() => setIsSettingsOpen(true)} className={`p-2 rounded-full transition relative ${googleToken ? 'bg-green-500 hover:bg-green-400' : 'bg-blue-500 hover:bg-blue-400'}`}>
            {googleToken ? <FolderPlus size={20} /> : <Settings size={20} />}
            {googleToken && <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-green-300 border-2 border-white rounded-full"></div>}
          </button>
        </div>
      </header>

      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm relative">
            <button onClick={() => setIsSettingsOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={24} /></button>
            <div className="flex items-center gap-3 mb-4 text-blue-600">
              <CloudUpload size={28} />
              <h2 className="text-xl font-bold text-gray-800">連接 Google Drive</h2>
            </div>
            {!googleToken ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">請貼上你在 Google Cloud Console 申請的 OAuth 用戶端 ID 以啟用備份功能。</p>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Client ID</label>
                  <input type="text" value={googleClientId} onChange={(e) => setGoogleClientId(e.target.value)} placeholder="xxx.apps.googleusercontent.com" className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <button onClick={handleGoogleLogin} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition">授權並登入 Google</button>
              </div>
            ) : (
              <div className="text-center py-4 space-y-4">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto"><CheckCircle2 size={32} /></div>
                <div>
                  <h3 className="font-bold text-lg text-gray-800">已連接雲端</h3>
                  <p className="text-sm text-gray-500">你可以直接在收據列表中點擊「備份相片」將原始圖檔存入 Drive。</p>
                </div>
                <button onClick={() => setGoogleToken(null)} className="w-full bg-gray-100 text-gray-600 font-bold py-2 rounded-xl hover:bg-gray-200 transition">登出並中斷連接</button>
              </div>
            )}
          </div>
        </div>
      )}

      {notification && (
        <div className={`fixed top-16 left-1/2 transform -translate-x-1/2 px-4 py-3 rounded-lg shadow-2xl z-40 text-sm font-bold transition-all duration-300 w-[90%] max-w-sm text-center ${notification.type === 'success' ? 'bg-green-500 text-white' : notification.type === 'info' ? 'bg-blue-500 text-white' : 'bg-red-500 text-white border-2 border-red-600'}`}>
          {notification.message}
        </div>
      )}

      <main className="max-w-md mx-auto p-4">
        {activeTab === 'upload' && (
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-2xl border-2 border-dashed border-blue-300 text-center relative hover:bg-blue-50 transition">
              <input ref={fileInputRef} type="file" multiple accept="image/*, image/jpeg, image/png, image/heic" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 shadow-inner"><Camera size={32} /></div>
                <div>
                  <p className="font-semibold text-lg text-blue-900">拍攝或上傳收據</p>
                  <p className="text-sm text-blue-600/70 font-medium">支援多選照片 (單次最多 10 張)</p>
                </div>
              </div>
            </div>

            {isProcessing && (
              <div className="flex items-center justify-center gap-3 p-4 bg-blue-50 rounded-xl text-blue-700 animate-pulse border border-blue-100 shadow-sm">
                <Loader2 className="animate-spin" />
                <span className="font-bold">AI 正在逐一辨識收據內容...</span>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <h2 className="font-bold text-gray-700">最近上傳 ({receipts.length})</h2>
                {hasDuplicates && <button onClick={removeAllDuplicates} className="text-xs text-orange-600 bg-orange-100 px-3 py-1.5 rounded-full font-bold flex items-center gap-1 hover:bg-orange-200 transition"><RefreshCw size={12} /> 清除重複</button>}
              </div>
              
              {receipts.length === 0 && !isProcessing && (
                <div className="text-center py-12 text-gray-400"><AlertCircle className="mx-auto mb-2 opacity-20" size={48} /><p>暫無記錄，請開始上傳</p></div>
              )}

              {receipts.slice(0, 5).map((item) => renderReceiptCard(item))}
              
              {receipts.length > 5 && (
                <button onClick={() => setActiveTab('history')} className="w-full py-3 text-sm text-blue-600 font-bold bg-blue-50 rounded-xl hover:bg-blue-100 transition shadow-sm">查看全部記錄 ({receipts.length})</button>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-blue-50 p-4 border-b border-blue-100 flex justify-between items-center">
                <div className="flex items-center gap-2 text-blue-800 font-bold"><Calendar size={20} /><span>對帳月份</span></div>
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-white border border-blue-200 text-blue-800 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 outline-none font-bold shadow-sm">
                  {monthlyData.length === 0 && <option value={currentMonthStr}>{currentMonthStr}</option>}
                  {monthlyData.map(data => <option key={data.month} value={data.month}>{data.month} ({data.receipts.length} 筆)</option>)}
                </select>
              </div>
              <div className="p-6 text-center">
                <p className="text-gray-500 text-sm mb-1 font-medium">該月總開支</p>
                <p className="text-4xl font-black text-blue-600 mb-4">${currentMonthData.total.toFixed(2)}</p>
                <button onClick={() => exportToCSV(currentMonthData.receipts, selectedMonth)} disabled={currentMonthData.receipts.length === 0} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3 px-4 rounded-xl font-bold transition shadow-sm"><Download size={20} />匯出 {selectedMonth} 對帳單 (CSV)</button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <h3 className="font-bold text-gray-700">明細記錄</h3>
                {currentMonthData.receipts.some(r => r.isDuplicate) && <button onClick={removeAllDuplicates} className="text-xs text-orange-600 bg-orange-100 px-3 py-1 rounded-full font-bold">清除重複</button>}
              </div>
              {currentMonthData.receipts.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-200 text-gray-400"><PieChart className="mx-auto mb-2 opacity-30" size={32} /><p>該月份沒有收據記錄</p></div>
              ) : (
                currentMonthData.receipts.map(item => renderReceiptCard(item))
              )}
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 w-full bg-white border-t border-gray-200 p-2 flex justify-around max-w-md left-1/2 transform -translate-x-1/2 z-20">
        <button onClick={() => setActiveTab('upload')} className={`flex flex-col items-center p-2 rounded-lg transition ${activeTab === 'upload' ? 'text-blue-600' : 'text-gray-400'}`}><Camera size={24} /><span className="text-[10px] mt-1 font-bold">掃描上傳</span></button>
        <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center p-2 rounded-lg transition ${activeTab === 'history' ? 'text-blue-600' : 'text-gray-400'}`}><PieChart size={24} /><span className="text-[10px] mt-1 font-bold">月度對帳</span></button>
      </nav>

      {enlargedImage && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center p-4 animate-in fade-in" onClick={() => setEnlargedImage(null)}>
          <button className="absolute top-6 right-6 text-white p-2 bg-white bg-opacity-10 rounded-full hover:bg-opacity-20 transition" onClick={() => setEnlargedImage(null)}><X size={24} /></button>
          <img src={enlargedImage} alt="Enlarged receipt" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  );
};

export default App;