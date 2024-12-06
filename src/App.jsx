import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './App.css';

// Use environment variable for API base URL
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
    <td>{(campaign.lead_contacted_count || 0).toLocaleString()}</td>
    <td>{(campaign.completed_lead_count || 0).toLocaleString()}</td>
    <td>{(campaign.lead_count || 0).toLocaleString()}</td>
    <td>{(campaign.sent_count || 0).toLocaleString()}</td>
    <td>{(campaign.replied_count || 0).toLocaleString()}</td>
    <td>{(campaign.positive_reply_count || 0).toLocaleString()}</td>
    <td>{(campaign.bounced_count || 0).toLocaleString()}</td>
    <td>{(campaign.unsubscribed_count || 0).toLocaleString()}</td>
    <td>{new Date(campaign.created_at).toLocaleDateString()}</td>
  </tr>
));

// Memoized summary card component
const SummaryCard = React.memo(({ title, value }) => (
  <div className="summary-card">
    <h3>{title}</h3>
    <span>{value.toLocaleString()}</span>
  </div>
));

function Dashboard() {
  const { workspaceName } = useParams();
  const navigate = useNavigate();
  
  const [campaigns, setCampaigns] = useState([]);
  const [previousCampaigns, setPreviousCampaigns] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  // Add axios config at the top of the Dashboard component
  const axiosConfig = useMemo(() => ({
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Origin': APP_DOMAIN
    },
    withCredentials: true
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

  // Extract unique teams from workspace names
  const teams = useMemo(() => {
    const teamSet = new Set(workspaces.map(w => {
      const parts = w.name.split('-');
      return parts.length > 2 ? parts[2].trim() : 'Unknown';
    }));
    return ['ALL', ...Array.from(teamSet)].sort();
  }, [workspaces]);

  // Filter workspaces by team
  const filteredWorkspaces = useMemo(() => {
    if (selectedTeam === 'ALL') return workspaces;
    return workspaces.filter(w => {
      const parts = w.name.split('-');
      const team = parts.length > 2 ? parts[2].trim() : 'Unknown';
      return team === selectedTeam;
    });
  }, [workspaces, selectedTeam]);

  // Handle team filter change
  const handleTeamChange = (e) => {
    setSelectedTeam(e.target.value);
    // Reset workspace selection when team changes
    setSelectedWorkspace('');
    navigate('/');
  };

  // Fetch workspaces
  const fetchWorkspaces = useCallback(async () => {
    try {
      console.log('Fetching workspaces from:', `${API_BASE_URL}/api/workspaces`);
      const response = await axios.get(`${API_BASE_URL}/api/workspaces`, axiosConfig);
      console.log('Workspaces response:', response.data);
      setWorkspaces(response.data);
      
      // If URL has workspace name, find and select it
      if (workspaceName && response.data.length > 0) {
        const workspace = response.data.find(w => w.name.toLowerCase() === workspaceName.toLowerCase());
        if (workspace) {
          setSelectedWorkspace(workspace._id);
        }
      }
    } catch (error) {
      console.error('Error fetching workspaces:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [API_BASE_URL, axiosConfig, workspaceName]);

  // Fetch campaign data
  const fetchCampaigns = useCallback(async () => {
    if (!selectedWorkspace) return;
    setLoading(true);
    try {
      console.log('Fetching campaigns for workspace:', selectedWorkspace);
      // Calculate previous period dates
      const currentStart = new Date(dateRange.startDate);
      const currentEnd = new Date(dateRange.endDate);
      const periodLength = currentEnd - currentStart;
      const previousStart = new Date(currentStart - periodLength);
      const previousEnd = new Date(currentStart);

      // Format dates for API
      const formatDate = (date) => date.toISOString().split('T')[0];

      console.log('Current period:', formatDate(currentStart), 'to', formatDate(currentEnd));
      console.log('Previous period:', formatDate(previousStart), 'to', formatDate(previousEnd));

      // Fetch both current and previous period data
      const [currentResponse, previousResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/campaign-stats`, {
          params: {
            workspaceId: selectedWorkspace,
            startDate: formatDate(currentStart),
            endDate: formatDate(currentEnd),
            status: statusFilter !== 'ALL' ? statusFilter : undefined
          },
          ...axiosConfig
        }),
        axios.get(`${API_BASE_URL}/api/campaign-stats`, {
          params: {
            workspaceId: selectedWorkspace,
            startDate: formatDate(previousStart),
            endDate: formatDate(previousEnd),
            status: statusFilter !== 'ALL' ? statusFilter : undefined
          },
          ...axiosConfig
        })
      ]);

      console.log('Current period data:', currentResponse.data);
      console.log('Previous period data:', previousResponse.data);

      setCampaigns(currentResponse.data);
      setPreviousCampaigns(previousResponse.data);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [selectedWorkspace, dateRange, statusFilter, API_BASE_URL, axiosConfig]);

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

  // Helper function to calculate percentage change
  const calculateChange = (current, previous) => {
    if (!previous) return 0;
    const change = ((current - previous) / previous * 100);
    return change.toFixed(1);
  };

  // Helper function to format change for display
  const formatChange = (change) => {
    return `${change}%`;
  };

  // Helper function to format change for display with color
  const formatChangeWithColor = (change, value) => {
    const color = value >= 0 ? '#22c55e' : '#ef4444'; // green for positive, red for negative
    return `<span style="color: ${color}">${value >= 0 ? 'up' : 'down'} ${formatChange(Math.abs(value))}</span>`;
  };

  // Memoize stats calculation
  const stats = useMemo(() => {
    // Calculate current period stats
    const totalContacted = campaigns.reduce((sum, camp) => sum + (camp.lead_contacted_count || 0), 0);
    const totalReplies = campaigns.reduce((sum, camp) => sum + (camp.replied_count || 0), 0);
    const positiveReplies = campaigns.reduce((sum, camp) => sum + (camp.positive_reply_count || 0), 0);
    
    // Calculate previous period stats
    const prevTotalContacted = previousCampaigns.reduce((sum, camp) => sum + (camp.lead_contacted_count || 0), 0);
    const prevTotalReplies = previousCampaigns.reduce((sum, camp) => sum + (camp.replied_count || 0), 0);
    const prevPositiveReplies = previousCampaigns.reduce((sum, camp) => sum + (camp.positive_reply_count || 0), 0);
    
    // Calculate changes
    const contactedChange = calculateChange(totalContacted, prevTotalContacted);
    
    const currentReplyRate = totalContacted ? (totalReplies / totalContacted * 100) : 0;
    const prevReplyRate = prevTotalContacted ? (prevTotalReplies / prevTotalContacted * 100) : 0;
    const replyRateChange = calculateChange(currentReplyRate, prevReplyRate);

    const currentLeadRate = totalContacted ? (positiveReplies / totalContacted * 100) : 0;
    const prevLeadRate = prevTotalContacted ? (prevPositiveReplies / prevTotalContacted * 100) : 0;
    const leadRateChange = calculateChange(currentLeadRate, prevLeadRate);

    const positiveRepliesChange = calculateChange(positiveReplies, prevPositiveReplies);

    // Generate summary text with bullet points
    const summaryText = `Compared to previous period:
• Contacted: ${formatChangeWithColor(contactedChange, contactedChange)}
• Reply Rate: ${formatChangeWithColor(replyRateChange, replyRateChange)}
• Positive Replies: ${formatChangeWithColor(positiveRepliesChange, positiveRepliesChange)}`;
    
    return {
      totalContacted,
      totalReplies,
      positiveReplies,
      leadRate: currentLeadRate.toFixed(1) + '%',
      replyRate: currentReplyRate.toFixed(1) + '%',
      summaryText
    };
  }, [campaigns, previousCampaigns]);

  // Update workspace selection to handle URL
  const handleWorkspaceChange = (e) => {
    const selectedId = e.target.value;
    const selected = workspaces.find(w => w._id === selectedId);
    if (selected) {
      // Extract first part of the name (before any dashes)
      const urlName = selected.name.split('-')[0].trim().toLowerCase();
      console.log('Selected workspace:', selected.name, 'URL name:', urlName);
      setSelectedWorkspace(selectedId);
      navigate(`/${urlName}`);
    } else {
      navigate('/');
    }
  };

  // Effect to handle initial workspace selection from URL
  useEffect(() => {
    if (workspaces.length > 0 && workspaceName) {
      console.log('Looking for workspace:', workspaceName);
      // Match workspace by checking if any workspace name starts with the URL name
      const workspace = workspaces.find(w => {
        const firstPart = w.name.split('-')[0].trim().toLowerCase();
        return firstPart === workspaceName.toLowerCase();
      });
      if (workspace) {
        console.log('Found workspace:', workspace.name);
        setSelectedWorkspace(workspace._id);
      } else {
        console.log('Workspace not found, redirecting to home');
        navigate('/');
      }
    }
  }, [workspaces, workspaceName, navigate]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  useEffect(() => {
    if (selectedWorkspace) {
      fetchCampaigns();
    }
  }, [selectedWorkspace, fetchCampaigns]);

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
      <header className="header">
        <h1>Campaign Statistics</h1>
        
        <div className="filters">
          <div className="filter-group">
            <label>Team:</label>
            <select 
              value={selectedTeam}
              onChange={handleTeamChange}
              disabled={loading}
            >
              {teams.map(team => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Workspace:</label>
            <select 
              value={selectedWorkspace} 
              onChange={handleWorkspaceChange}
              disabled={loading}
            >
              <option value="">Select Workspace</option>
              {filteredWorkspaces.map(workspace => (
                <option key={workspace._id} value={workspace._id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Status:</label>
            <select 
              value={statusFilter} 
              onChange={(e) => debouncedStatusChange(e.target.value)}
              disabled={loading}
            >
              <option value="ALL">All</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="PAUSED">Paused</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Date Range:</label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => debouncedDateChange({ ...dateRange, startDate: e.target.value })}
              disabled={loading}
            />
            <span>to</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => debouncedDateChange({ ...dateRange, endDate: e.target.value })}
              disabled={loading}
            />
          </div>
        </div>
      </header>
      
      <main className="main">
        <div className="stats-container">
          <div className="stats-summary">
            <SummaryCard title="Total Contacted" value={stats.totalContacted} />
            <SummaryCard title="Total Replies" value={stats.totalReplies} />
            <SummaryCard title="Positive Replies" value={stats.positiveReplies} />
            <SummaryCard title="Reply Rate" value={stats.replyRate} />
            <SummaryCard title="Lead Rate" value={stats.leadRate} />
          </div>
          <div className="stats-text-summary">
            <p dangerouslySetInnerHTML={{ __html: stats.summaryText }}></p>
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
                  <th onClick={() => handleSort('lead_contacted_count')} className="sortable" data-sort={sortBy === 'lead_contacted_count' ? sortOrder : ''}>
                    Contacted
                  </th>
                  <th onClick={() => handleSort('completed_lead_count')} className="sortable" data-sort={sortBy === 'completed_lead_count' ? sortOrder : ''}>
                    Completed
                  </th>
                  <th onClick={() => handleSort('lead_count')} className="sortable" data-sort={sortBy === 'lead_count' ? sortOrder : ''}>
                    Leads
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

// Main App component with routing
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/:workspaceName" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
