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

// Environment variables and API configuration
const isDevelopment = import.meta.env.DEV;
const API_BASE_URL = isDevelopment ? '' : import.meta.env.VITE_API_BASE_URL; // Empty string for development to use proxy
const APP_DOMAIN = import.meta.env.VITE_APP_DOMAIN;

// Validate environment variables
if (!isDevelopment && !API_BASE_URL) {
  console.error('VITE_API_BASE_URL is not defined');
}
if (!APP_DOMAIN) {
  console.error('VITE_APP_DOMAIN is not defined');
}

console.log('Environment:', isDevelopment ? 'Development' : 'Production');
console.log('API Base URL:', API_BASE_URL || '(using proxy)');
console.log('App Domain:', APP_DOMAIN);

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
    start.setDate(end.getDate() - 7);
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
    timeout: 10000, // 10 second timeout
    withCredentials: false // Explicitly disable credentials
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
  const handleDateChange = useCallback((newRange) => {
    console.log('Date range changed:', newRange);
    // Ensure we have valid Date objects
    const startDate = new Date(newRange.startDate);
    const endDate = new Date(newRange.endDate);
    
    // Set time to start/end of day
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    
    setDateRange({
      startDate,
      endDate
    });
  }, []);

  // Filter campaigns by date range
  const filterCampaignsByDate = useCallback((campaigns, startDate, endDate) => {
    return campaigns.filter(campaign => {
      const campaignDate = new Date(campaign.created_at);
      return campaignDate >= startDate && campaignDate <= endDate;
    });
  }, []);

  // Filter campaign data for stats calculation
  const getFilteredStats = useCallback((campaigns, startDate, endDate) => {
    // Filter campaign data within date range
    const filteredData = campaigns.map(campaign => {
      const campaignDate = new Date(campaign.created_at);
      if (campaignDate >= startDate && campaignDate <= endDate) {
        return campaign;
      }
      // Return campaign with zero counts if outside date range
      return {
        ...campaign,
        lead_contacted_count: 0,
        replied_count: 0,
        positive_reply_count: 0
      };
    });

    // Calculate stats from filtered data
    const stats = filteredData.reduce((acc, campaign) => {
      acc.totalContacted += campaign.lead_contacted_count || 0;
      acc.totalReplies += campaign.replied_count || 0;
      acc.positiveReplies += campaign.positive_reply_count || 0;
      return acc;
    }, {
      totalContacted: 0,
      totalReplies: 0,
      positiveReplies: 0
    });

    // Calculate lead rate
    stats.leadRate = stats.totalContacted > 0 
      ? `${((stats.positiveReplies / stats.totalContacted) * 100).toFixed(1)}%`
      : '0%';

    return stats;
  }, []);

  // Update stats when campaigns change
  useEffect(() => {
    const newStats = getFilteredStats(campaigns, dateRange.startDate, dateRange.endDate);
    setStats(newStats);
  }, [campaigns, getFilteredStats, dateRange]);

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
        logError('Fetching workspaces from:', `${API_BASE_URL}/api/workspaces`);
        const response = await axios.get(`${API_BASE_URL}/api/workspaces`, {
          ...axiosConfig,
          headers: {
            ...axiosConfig.headers,
            'Access-Control-Allow-Origin': '*'
          }
        });
        
        if (!response?.data) {
          throw new Error('No data received from workspaces API');
        }

        logError('Workspaces Response:', response.data);
        
        if (!Array.isArray(response.data) || response.data.length === 0) {
          setError('No workspaces found');
          return;
        }

        setWorkspaces(response.data);

        // If no workspace is selected but we have workspaces, select the first one
        if (!selectedWorkspace && response.data.length > 0) {
          const firstWorkspace = response.data[0];
          logError('Setting first workspace:', firstWorkspace);
          setSelectedWorkspace(firstWorkspace);
          localStorage.setItem('selectedWorkspace', JSON.stringify(firstWorkspace));
        }
      } catch (error) {
        const errorMessage = error.response?.data?.error || error.message || 'Failed to fetch workspaces';
        logError('Workspaces Error:', {
          message: errorMessage,
          status: error.response?.status,
          data: error.response?.data,
          config: error.config
        });
        setError(errorMessage);
      }
    };

    fetchWorkspaces();
  }, []); // Only run once on mount

  // Handle workspace selection
  const handleWorkspaceChange = useCallback((workspaceId) => {
    logError('Workspace change:', workspaceId);
    const workspace = workspaces.find(w => w._id === workspaceId);
    if (workspace) {
      logError('Setting workspace:', workspace);
      setSelectedWorkspace(workspace);
      localStorage.setItem('selectedWorkspace', JSON.stringify(workspace));
    } else {
      logError('Workspace not found:', workspaceId);
      setError('Invalid workspace selection');
    }
  }, [workspaces]);

  // Initialize selectedWorkspace from localStorage
  useEffect(() => {
    const savedWorkspace = localStorage.getItem('selectedWorkspace');
    if (savedWorkspace) {
      try {
        const workspace = JSON.parse(savedWorkspace);
        if (workspace?._id) {
          logError('Restoring workspace from localStorage:', workspace);
          setSelectedWorkspace(workspace);
        }
      } catch (error) {
        logError('Error parsing saved workspace:', error);
        localStorage.removeItem('selectedWorkspace');
      }
    }
  }, []);

  // Fetch campaign data when filters change
  useEffect(() => {
    if (!selectedWorkspace) return;
    
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = {
          workspaceId: selectedWorkspace._id,
          status: statusFilter === 'ALL' ? undefined : statusFilter
        };

        console.log('Fetching with params:', params);

        const response = await axios.get(`${API_BASE_URL}/api/campaign-stats`, {
          ...axiosConfig,
          params
        });

        console.log('Campaign data received:', response.data);
        
        // Set all campaigns
        setCampaigns(response.data);

        // Calculate filtered stats
        const newStats = getFilteredStats(
          response.data,
          dateRange.startDate,
          dateRange.endDate
        );
        console.log('New stats calculated:', newStats);
        setStats(newStats);
      } catch (error) {
        console.error('Error fetching campaign data:', error);
        setError(formatErrorMessage(error));
        setCampaigns([]);
        setStats({
          totalContacted: 0,
          totalReplies: 0,
          positiveReplies: 0,
          leadRate: '0%'
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedWorkspace, statusFilter, dateRange, API_BASE_URL, axiosConfig, getFilteredStats]);

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
        <div className="filters">
          <select 
            value={selectedWorkspace?._id} 
            onChange={(e) => handleWorkspaceChange(e.target.value)}
          >
            {workspaces.map(workspace => (
              <option key={workspace._id} value={workspace._id}>
                {workspace.name}
              </option>
            ))}
          </select>

          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
            <option value="COMPLETED">Completed</option>
          </select>

          <div className="date-range">
            <input 
              type="date" 
              value={dateRange.startDate.toISOString().split('T')[0]}
              onChange={(e) => handleDateChange({
                ...dateRange,
                startDate: new Date(e.target.value)
              })}
            />
            <input 
              type="date"
              value={dateRange.endDate.toISOString().split('T')[0]}
              onChange={(e) => handleDateChange({
                ...dateRange,
                endDate: new Date(e.target.value)
              })}
            />
          </div>
        </div>

        <div className="summary-cards">
          <div className="card">
            <h3>Total Contacted</h3>
            <div className="metric">{stats.totalContacted.toLocaleString()}</div>
          </div>
          <div className="card">
            <h3>Total Replies</h3>
            <div className="metric">{stats.totalReplies.toLocaleString()}</div>
          </div>
          <div className="card">
            <h3>Positive Replies</h3>
            <div className="metric">{stats.positiveReplies.toLocaleString()}</div>
          </div>
          <div className="card">
            <h3>Lead Rate</h3>
            <div className="metric">{stats.leadRate}</div>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

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
