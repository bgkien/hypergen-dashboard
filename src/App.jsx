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
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
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
    withCredentials: true,
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

  // Fetch workspaces with improved error handling
  const fetchWorkspaces = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await axios.get(`${API_BASE_URL}/api/workspaces`, axiosConfig);
      
      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid workspace data received from server');
      }
      
      // Validate and format workspace data
      const workspaceData = response.data
        .filter(workspace => workspace._id && workspace.name) // Ensure required fields exist
        .map(workspace => ({
          ...workspace,
          _id: workspace._id.toString(), // Ensure ID is a string
          name: workspace.name.trim() // Clean workspace name
        }));
      
      if (workspaceData.length === 0) {
        throw new Error('No valid workspaces found');
      }

      setWorkspaces(workspaceData);
      
      // Set default workspace if none selected
      if (!selectedWorkspace || !workspaceData.find(w => w._id === selectedWorkspace)) {
        setSelectedWorkspace(workspaceData[0]._id);
      }

      logError('Workspaces fetched successfully', { count: workspaceData.length });
    } catch (error) {
      logError('Workspace fetch error', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      setError(`Error loading workspaces: ${formatErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }, [selectedWorkspace, API_BASE_URL, axiosConfig, formatErrorMessage]);

  // Fetch campaigns with improved error handling
  const fetchCampaigns = useCallback(async () => {
    if (!selectedWorkspace) {
      logError('No workspace selected');
      setError('Please select a workspace');
      return;
    }

    if (!isValidObjectId(selectedWorkspace)) {
      logError('Invalid workspace ID format', { workspaceId: selectedWorkspace });
      setError('Invalid workspace ID format. Please select a valid workspace.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Ensure dates are in YYYY-MM-DD format
      const formattedStartDate = new Date(dateRange.startDate).toISOString().split('T')[0];
      const formattedEndDate = new Date(dateRange.endDate).toISOString().split('T')[0];

      const params = new URLSearchParams({
        workspaceId: selectedWorkspace,
        start_date: formattedStartDate,
        end_date: formattedEndDate
      });

      if (statusFilter && statusFilter !== 'ALL') {
        params.append('status', statusFilter);
      }

      const url = `${API_BASE_URL}/api/campaign-stats?${params.toString()}`;
      logError('Fetching campaigns', { url, params: Object.fromEntries(params) });

      const response = await axios.get(url, axiosConfig);

      if (!Array.isArray(response.data)) {
        throw new Error('Invalid response format: expected an array of campaigns');
      }

      // Validate and format campaign data
      const campaignData = response.data.map(campaign => ({
        ...campaign,
        _id: campaign._id.toString(),
        camp_name: campaign.camp_name || 'Unnamed Campaign',
        status: campaign.status || 'UNKNOWN',
        lead_count: parseInt(campaign.lead_count) || 0,
        completed_lead_count: parseInt(campaign.completed_lead_count) || 0,
        lead_contacted_count: parseInt(campaign.lead_contacted_count) || 0,
        sent_count: parseInt(campaign.sent_count) || 0,
        replied_count: parseInt(campaign.replied_count) || 0,
        positive_reply_count: parseInt(campaign.positive_reply_count) || 0,
        bounced_count: parseInt(campaign.bounced_count) || 0,
        unsubscribed_count: parseInt(campaign.unsubscribed_count) || 0,
        created_at: campaign.created_at || new Date().toISOString()
      }));

      setCampaigns(campaignData);
      
      // Calculate and set stats
      const calculatedStats = calculateStats(campaignData);
      logError('Calculated Stats', calculatedStats);
      setStats(calculatedStats);

    } catch (error) {
      logError('Campaign Fetch Error', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        config: error.config
      });
      
      setError(`Error loading campaigns: ${formatErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }, [
    selectedWorkspace,
    dateRange,
    statusFilter,
    API_BASE_URL,
    axiosConfig,
    calculateStats,
    isValidObjectId,
    formatErrorMessage
  ]);

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

  // Fetch data with comprehensive error handling
  useEffect(() => {
    const fetchData = async () => {
      try {
        logError('Starting fetchData');
        
        // Fetch Workspaces
        const workspacesResponse = await axios.get(
          `${API_BASE_URL}/api/workspaces`,
          {
            ...axiosConfig,
            withCredentials: true
          }
        );
        
        logError('Workspaces Response', workspacesResponse.data);
        setWorkspaces(workspacesResponse.data);

        // Fetch Campaigns
        const campaignsResponse = await axios.get(
          `${API_BASE_URL}/api/campaign-stats`,
          {
            ...axiosConfig,
            withCredentials: true
          }
        );
        
        const fetchedCampaigns = campaignsResponse.data;
        logError('Campaigns Response', fetchedCampaigns);
        
        setCampaigns(fetchedCampaigns);

        // Calculate and set stats
        const calculatedStats = calculateStats(fetchedCampaigns);
        logError('Calculated Stats', calculatedStats);
        setStats(calculatedStats);

        setLoading(false);
      } catch (err) {
        logError('Full Fetch Error', err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    const fetchTimeout = setTimeout(() => {
      fetchCampaigns();
    }, 300); // 300ms debounce

    return () => clearTimeout(fetchTimeout);
  }, [selectedWorkspace, statusFilter, dateRange]);

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
              value={dateRange.startDate} 
              onChange={(e) => debouncedDateChange({
                ...dateRange, 
                startDate: e.target.value
              })}
            />
            <input 
              type="date" 
              value={dateRange.endDate} 
              onChange={(e) => debouncedDateChange({
                ...dateRange, 
                endDate: e.target.value
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
