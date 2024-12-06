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
const TableRow = React.memo(({ campaign }) => {
  // Debug log for campaign data in row
  console.log('Rendering campaign row:', {
    id: campaign._id,
    name: campaign.camp_name,
    stats: {
      contacted: campaign.lead_contacted_count,
      replies: campaign.replied_count,
      positive: campaign.positive_reply_count
    }
  });

  return (
    <tr>
      <td>{campaign.camp_name}</td>
      <td>
        <span className="status-badge" data-status={campaign.status}>
          {campaign.status}
        </span>
      </td>
      <td>{campaign.lead_count.toLocaleString()}</td>
      <td>{campaign.completed_lead_count.toLocaleString()}</td>
      <td>{campaign.lead_contacted_count.toLocaleString()}</td>
      <td>{campaign.sent_count.toLocaleString()}</td>
      <td>{campaign.replied_count.toLocaleString()}</td>
      <td>{campaign.positive_reply_count.toLocaleString()}</td>
      <td>{campaign.bounced_count.toLocaleString()}</td>
      <td>{campaign.unsubscribed_count.toLocaleString()}</td>
      <td>{new Date(campaign.created_at).toLocaleDateString()}</td>
    </tr>
  );
});

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
    start.setDate(end.getDate() - 14); // Default to 14 days
    
    // Set time to start/end of day
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    
    console.log('Initializing date range:', { start, end });
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
    withCredentials: true
  }), []);

  // Initialize axios defaults
  useEffect(() => {
    axios.defaults.withCredentials = true;
  }, []);

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
    
    if (!newRange.startDate || !newRange.endDate) {
      console.error('Invalid date range:', newRange);
      return;
    }
    
    // Ensure we have valid Date objects
    const startDate = new Date(newRange.startDate);
    const endDate = new Date(newRange.endDate);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.error('Invalid date objects:', { startDate, endDate });
      return;
    }
    
    // Set time to start/end of day
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    
    console.log('Setting new date range:', { startDate, endDate });
    setDateRange({
      startDate,
      endDate
    });
  }, []);

  // Fetch campaign data
  const fetchCampaigns = useCallback(async (workspaceId) => {
    if (!workspaceId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      console.log('Fetching campaigns for workspace:', workspaceId);
      const response = await axios.get(`${API_BASE_URL}/api/campaigns`, {
        params: { workspaceId },
        ...axiosConfig
      });
      
      // Transform and validate campaign data
      const transformedCampaigns = response.data.map(campaign => ({
        ...campaign,
        lead_contacted_count: parseInt(campaign.lead_contacted_count) || 0,
        replied_count: parseInt(campaign.replied_count) || 0,
        positive_reply_count: parseInt(campaign.positive_reply_count) || 0,
        lead_count: parseInt(campaign.lead_count) || 0,
        completed_lead_count: parseInt(campaign.completed_lead_count) || 0,
        sent_count: parseInt(campaign.sent_count) || 0,
        bounced_count: parseInt(campaign.bounced_count) || 0,
        unsubscribed_count: parseInt(campaign.unsubscribed_count) || 0
      }));

      console.log('Campaign data received:', transformedCampaigns);
      setCampaigns(transformedCampaigns);
    } catch (err) {
      console.error('Error fetching campaigns:', err);
      setError(formatErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [axiosConfig]);

  // Filter campaigns by date range
  const filterCampaignsByDate = useCallback((campaigns, startDate, endDate) => {
    return campaigns.filter(campaign => {
      const campaignDate = new Date(campaign.created_at);
      return campaignDate >= startDate && campaignDate <= endDate;
    });
  }, []);

  // Filter campaigns by status
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(campaign => {
      const matchesStatus = statusFilter === 'ALL' || campaign.status === statusFilter;
      return matchesStatus;
    });
  }, [campaigns, statusFilter]);

  // Filter campaign data for stats calculation
  const getFilteredStats = useCallback((campaigns, startDate, endDate) => {
    console.log('Calculating stats for range:', { 
      startDate: startDate.toISOString(), 
      endDate: endDate.toISOString() 
    });
    console.log('Number of campaigns:', campaigns.length);
    
    // Calculate stats from filtered data within date range
    const stats = campaigns.reduce((acc, campaign) => {
      // Get all relevant dates
      const lastActivity = campaign.last_activity_date ? new Date(campaign.last_activity_date) : null;
      const createdAt = new Date(campaign.created_at);
      const updatedAt = campaign.updated_at ? new Date(campaign.updated_at) : null;
      
      // A campaign should be counted if ANY of its activity dates fall within the range
      const dates = [createdAt];
      if (lastActivity) dates.push(lastActivity);
      if (updatedAt) dates.push(updatedAt);
      
      // Check if any of the dates fall within the range
      const isInRange = dates.some(date => 
        !isNaN(date.getTime()) && date >= startDate && date <= endDate
      );

      // Debug log campaign data
      console.log('Processing campaign:', {
        id: campaign._id,
        name: campaign.camp_name,
        status: campaign.status,
        dates: {
          created: createdAt.toISOString(),
          lastActivity: lastActivity?.toISOString(),
          updated: updatedAt?.toISOString()
        },
        inRange: isInRange,
        stats: {
          contacted: campaign.lead_contacted_count,
          replies: campaign.replied_count,
          positive: campaign.positive_reply_count
        }
      });

      if (isInRange) {
        acc.totalContacted += campaign.lead_contacted_count;
        acc.totalReplies += campaign.replied_count;
        acc.positiveReplies += campaign.positive_reply_count;

        // Log contribution
        console.log('Adding stats from campaign:', {
          name: campaign.camp_name,
          status: campaign.status,
          contribution: {
            contacted: campaign.lead_contacted_count,
            replies: campaign.replied_count,
            positive: campaign.positive_reply_count
          },
          newTotals: {
            totalContacted: acc.totalContacted,
            totalReplies: acc.totalReplies,
            positiveReplies: acc.positiveReplies
          }
        });
      }
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

    console.log('Final calculated stats:', {
      ...stats,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      }
    });
    return stats;
  }, []);

  // Update stats when date range or campaigns change
  useEffect(() => {
    console.log('Stats effect triggered:', { 
      campaignsLength: campaigns.length,
      dateRange: {
        start: dateRange.startDate?.toISOString(),
        end: dateRange.endDate?.toISOString()
      }
    });

    if (campaigns.length > 0 && dateRange.startDate && dateRange.endDate) {
      // Calculate stats based on all campaigns, not just filtered ones
      const newStats = getFilteredStats(campaigns, dateRange.startDate, dateRange.endDate);
      console.log('Setting new stats:', newStats);
      setStats(newStats);
    }
  }, [campaigns, dateRange, getFilteredStats]);

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
        const response = await axios.get(`${API_BASE_URL}/api/workspaces`, axiosConfig);
        
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
                {filteredCampaigns.map(campaign => (
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
