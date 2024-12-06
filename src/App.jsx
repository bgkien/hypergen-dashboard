import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import './App.css';

// Global error tracking
window.globalErrorLog = [];

// Custom error logging function
function logError(message, data = null) {
  const errorEntry = { 
    timestamp: new Date().toISOString(), 
    message, 
    data 
  };
  window.globalErrorLog.push(errorEntry);
  console.error('🚨 ERROR LOG:', errorEntry);
}

// Use environment variables
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const APP_DOMAIN = import.meta.env.VITE_APP_DOMAIN;

// Memoized table row component
const TableRow = React.memo(({ campaign }) => (
  <tr>
    <td>{campaign.camp_name}</td>
    <td>
      <span className="status-badge" data-status={campaign.status}>
        {campaign.status}
      </span>
    </td>
    <td>{(campaign.lead_count || 0).toLocaleString()}</td>
    <td>{(campaign.completed_lead_count || 0).toLocaleString()}</td>
    <td>{(campaign.lead_contacted_count || 0).toLocaleString()}</td>
    <td>{(campaign.sent_count || 0).toLocaleString()}</td>
    <td>{(campaign.replied_count || 0).toLocaleString()}</td>
    <td>{(campaign.positive_reply_count || 0).toLocaleString()}</td>
    <td>{(campaign.bounced_count || 0).toLocaleString()}</td>
    <td>{(campaign.unsubscribed_count || 0).toLocaleString()}</td>
    <td>{new Date(campaign.created_at).toLocaleDateString()}</td>
  </tr>
));

// Memoized summary card component
const SummaryCard = React.memo(({ title, value }) => {
  console.error(`DEBUG: SummaryCard Rendering - Title: ${title}, Value: ${value}`);
  return (
    <div className="summary-card">
      <h3>{title}</h3>
      <span>{typeof value === 'number' ? value.toLocaleString() : value}</span>
    </div>
  );
});

function App() {
  const [campaigns, setCampaigns] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState(() => {
    const saved = localStorage.getItem('selectedWorkspace');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30); // Last 30 days by default
    return {
      startDate: start,
      endDate: end
    };
  });

  const [stats, setStats] = useState({
    totalContacted: 0,
    totalReplies: 0,
    positiveReplies: 0,
    leadRate: '0%'
  });

  // Axios configuration with error logging
  const axiosConfig = useMemo(() => ({
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    timeout: 10000 // 10 second timeout
  }), []);

  // Debounce workspace change with shorter delay
  const debouncedWorkspaceChange = useCallback((value) => {
    setSelectedWorkspace(value);
  }, []);

  // Debounce status filter change with shorter delay
  const debouncedStatusChange = useCallback((value) => {
    setStatusFilter(value);
  }, []);

  // Debounce date range change with shorter delay
  const debouncedDateChange = useCallback((newRange) => {
    setDateRange(newRange);
  }, []);

  // Calculate stats from campaigns data
  const calculateStats = useCallback((campaigns) => {
    try {
      logError('Calculating stats - Raw Campaigns', campaigns);

      if (!Array.isArray(campaigns)) {
        logError('Invalid campaigns data', { type: typeof campaigns });
        return { 
          totalContacted: 0,
          totalReplies: 0,
          positiveReplies: 0,
          leadRate: '0%'
        };
      }

      const stats = campaigns.reduce((acc, campaign) => {
        const contacted = campaign.lead_contacted_count || 0;
        const replies = campaign.replied_count || 0;
        const positiveReplies = campaign.positive_reply_count || 0;

        logError('Processing Campaign', {
          name: campaign.camp_name,
          contacted,
          replies,
          positiveReplies
        });

        return {
          totalContacted: acc.totalContacted + contacted,
          totalReplies: acc.totalReplies + replies,
          positiveReplies: acc.positiveReplies + positiveReplies
        };
      }, { totalContacted: 0, totalReplies: 0, positiveReplies: 0 });

      // Calculate lead rate
      const leadRate = stats.totalContacted > 0 
        ? ((stats.positiveReplies / stats.totalContacted) * 100).toFixed(1) + '%'
        : '0%';

      const finalStats = {
        ...stats,
        leadRate
      };

      logError('Final Stats Calculation', finalStats);
      return finalStats;

    } catch (err) {
      logError('Stats Calculation Error', err);
      return { 
        totalContacted: 0,
        totalReplies: 0,
        positiveReplies: 0,
        leadRate: '0%'
      };
    }
  }, []);

  // Validate MongoDB ObjectId (24-character hex string only)
  const isValidObjectId = useCallback((id) => {
    return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
  }, []);

  // Format error message for display
  const formatErrorMessage = useCallback((error) => {
    if (error.response?.data?.error && error.response?.data?.details) {
      return `${error.response.data.error}: ${error.response.data.details}`;
    }
    return error.response?.data?.error || error.message || 'An unexpected error occurred';
  }, []);

  // Fetch workspaces on component mount
  useEffect(() => {
    const fetchWorkspaces = async () => {
      try {
        logError('Fetching workspaces');
        const response = await axios.get(`${API_BASE_URL}/api/workspaces`, axiosConfig);
        logError('Workspaces Response', response.data);
        setWorkspaces(response.data);

        // If no workspace is selected but we have workspaces, select the first one
        if (!selectedWorkspace && response.data.length > 0) {
          const firstWorkspace = response.data[0];
          setSelectedWorkspace(firstWorkspace);
          localStorage.setItem('selectedWorkspace', JSON.stringify(firstWorkspace));
        }
      } catch (error) {
        logError('Workspaces Error', error);
        setError('Failed to fetch workspaces');
      }
    };

    fetchWorkspaces();
  }, []); // Only run once on mount

  // Fetch campaign data when workspace changes
  useEffect(() => {
    if (!selectedWorkspace) {
      logError('No workspace selected');
      setCampaigns([]);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      logError('Starting fetchData');
      setLoading(true);
      setError(null);

      try {
        const params = {
          workspace_id: selectedWorkspace._id,
          status: statusFilter === 'ALL' ? undefined : statusFilter
        };

        // Only add dates if they exist and are valid
        if (dateRange?.startDate instanceof Date) {
          params.start_date = dateRange.startDate.toISOString();
        }
        if (dateRange?.endDate instanceof Date) {
          params.end_date = dateRange.endDate.toISOString();
        }

        const response = await axios.get(`${API_BASE_URL}/api/campaign-stats`, {
          ...axiosConfig,
          params
        });

        logError('Campaign Stats Response', response.data);
        setCampaigns(response.data);
        setError(null);
      } catch (error) {
        logError('Full Fetch Error', error);
        setError(formatErrorMessage(error));
        setCampaigns([]);
      } finally {
        setLoading(false);
      }
    };

    // Set a timeout to prevent too frequent API calls
    const fetchTimeout = setTimeout(fetchData, 300);
    return () => clearTimeout(fetchTimeout);
  }, [selectedWorkspace, statusFilter, dateRange, axiosConfig]);

  // Sort campaigns
  const sortCampaigns = useCallback((data) => {
    return [...data].sort((a, b) => {
      let compareA = a[sortBy];
      let compareB = b[sortBy];

      if (sortBy === 'created_at') {
        compareA = new Date(compareA).getTime();
        compareB = new Date(compareB).getTime();
      } 
      else if (typeof compareA === 'number' && typeof compareB === 'number') {
        // Keep as is
      }
      else if (typeof compareA === 'string' && typeof compareB === 'string') {
        compareA = compareA.toLowerCase();
        compareB = compareB.toLowerCase();
      }

      if (compareA === null || compareA === undefined) return 1;
      if (compareB === null || compareB === undefined) return -1;

      return (sortOrder === 'asc' ? 1 : -1) * (compareA > compareB ? 1 : compareA < compareB ? -1 : 0);
    });
  }, [sortBy, sortOrder]);

  const handleSort = useCallback((field) => {
    setSortBy(prevSort => {
      const newOrder = field === prevSort && sortOrder === 'desc' ? 'asc' : 'desc';
      setSortOrder(newOrder);
      return field;
    });
    setCampaigns(prev => sortCampaigns([...prev]));
  }, [sortOrder, sortCampaigns]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="app">
      <header>
        <h1>Campaign Analytics Dashboard</h1>
      </header>

      <main className="main">
        <div className="stats-summary">
          <div className="summary-card">
            <h3>Total Contacted</h3>
            <span>{stats.totalContacted?.toLocaleString() || '0'}</span>
          </div>
          <div className="summary-card">
            <h3>Total Replies</h3>
            <span>{stats.totalReplies?.toLocaleString() || '0'}</span>
          </div>
          <div className="summary-card">
            <h3>Positive Replies</h3>
            <span>{stats.positiveReplies?.toLocaleString() || '0'}</span>
          </div>
          <div className="summary-card">
            <h3>Lead Rate</h3>
            <span>{stats.leadRate || '0%'}</span>
          </div>
        </div>

        {/* Comprehensive Debug Information */}
        <div style={{color: 'red', fontSize: '12px', border: '1px solid red', padding: '10px'}}>
          <h4>Debug Information</h4>
          <p>API Base URL: {API_BASE_URL}</p>
          <p>Campaigns Count: {campaigns.length}</p>
          <p>Global Error Log Length: {window.globalErrorLog.length}</p>
          <details>
            <summary>Global Error Log</summary>
            <pre>{JSON.stringify(window.globalErrorLog, null, 2)}</pre>
          </details>
          <details>
            <summary>Raw Campaigns</summary>
            <pre>{JSON.stringify(campaigns, null, 2)}</pre>
          </details>
        </div>

        <div className="filters">
          <select 
            value={selectedWorkspace} 
            onChange={(e) => debouncedWorkspaceChange(e.target.value)}
          >
            {workspaces.map(workspace => (
              <option key={workspace._id} value={workspace._id}>
                {workspace.name}
              </option>
            ))}
          </select>

          <select 
            value={statusFilter} 
            onChange={(e) => debouncedStatusChange(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
          </select>

          <div className="date-range">
            <input 
              type="date" 
              value={dateRange.startDate.toISOString().split('T')[0]} 
              onChange={(e) => debouncedDateChange({
                ...dateRange, 
                startDate: new Date(e.target.value)
              })}
            />
            <input 
              type="date" 
              value={dateRange.endDate.toISOString().split('T')[0]} 
              onChange={(e) => debouncedDateChange({
                ...dateRange, 
                endDate: new Date(e.target.value)
              })}
            />
          </div>
        </div>

        <div className="table-container">
          {loading ? (
            <div className="loading-overlay">
              <div className="loading-spinner"></div>
              <div>Loading campaigns...</div>
            </div>
          ) : error ? (
            <div className="error-message">{error}</div>
          ) : campaigns.length === 0 ? (
            <div className="no-data-message">No campaigns found for the selected filters</div>
          ) : (
            <table className="campaigns-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('camp_name')} className="sortable" data-sort={sortBy === 'camp_name' ? sortOrder : ''}>
                    Campaign Name
                  </th>
                  <th>Status</th>
                  <th onClick={() => handleSort('lead_count')} className="sortable" data-sort={sortBy === 'lead_count' ? sortOrder : ''}>
                    Leads
                  </th>
                  <th onClick={() => handleSort('completed_lead_count')} className="sortable" data-sort={sortBy === 'completed_lead_count' ? sortOrder : ''}>
                    Completed
                  </th>
                  <th onClick={() => handleSort('lead_contacted_count')} className="sortable" data-sort={sortBy === 'lead_contacted_count' ? sortOrder : ''}>
                    Contacted
                  </th>
                  <th onClick={() => handleSort('sent_count')} className="sortable" data-sort={sortBy === 'sent_count' ? sortOrder : ''}>
                    Sent
                  </th>
                  <th onClick={() => handleSort('replied_count')} className="sortable" data-sort={sortBy === 'replied_count' ? sortOrder : ''}>
                    Replies
                  </th>
                  <th onClick={() => handleSort('positive_reply_count')} className="sortable" data-sort={sortBy === 'positive_reply_count' ? sortOrder : ''}>
                    Positive Replies
                  </th>
                  <th onClick={() => handleSort('bounced_count')} className="sortable" data-sort={sortBy === 'bounced_count' ? sortOrder : ''}>
                    Bounced
                  </th>
                  <th onClick={() => handleSort('unsubscribed_count')} className="sortable" data-sort={sortBy === 'unsubscribed_count' ? sortOrder : ''}>
                    Unsubscribed
                  </th>
                  <th onClick={() => handleSort('created_at')} className="sortable" data-sort={sortBy === 'created_at' ? sortOrder : ''}>
                    Created At
                  </th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(campaign => (
                  <TableRow key={campaign._id} campaign={campaign} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
