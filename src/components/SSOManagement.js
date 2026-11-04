import React, { useState } from 'react';
import SSOTrustedSystemsManagement from './SSOTrustedSystemsManagement';
import SSOAuditLogs from './SSOAuditLogs';

const SSOManagement = () => {
  const [activeTab, setActiveTab] = useState('systems');

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200">
        <nav className="flex gap-2">
          <button
            onClick={() => setActiveTab('systems')}
            className={`px-6 py-3 font-medium text-sm transition-colors ${
              activeTab === 'systems'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            🔐 信頼システム管理
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-6 py-3 font-medium text-sm transition-colors ${
              activeTab === 'logs'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            📋 監査ログ
          </button>
        </nav>
      </div>

      <div>
        {activeTab === 'systems' && <SSOTrustedSystemsManagement />}
        {activeTab === 'logs' && <SSOAuditLogs />}
      </div>
    </div>
  );
};

export default SSOManagement;

