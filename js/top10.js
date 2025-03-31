document.addEventListener('DOMContentLoaded', async function () {
    const currentDateTime = new Date();

    let setLocationCategory = null;
    let setLocationGroupOwner = null;
    let setTimeseriesGroup1 = null;
    let setTimeseriesGroup2 = null;
    let setLookBackHours = null;
    let reportDiv = null;
    let beginYear = null;
    let beginYear_2 = null;
    let endYear = null;
    let endYear_2 = null;

    reportDiv = "top10";
    setLocationCategory = "Basins";
    setLocationGroupOwner = "Datman";

    if (typeof type_flow === 'undefined' || type_flow === null) {
        type_flow = null;
    }

    if (type_flow === 'top10_inflow') {
        setTimeseriesGroup1 = "Datman-Inflow";
        setTimeseriesGroup2 = "Datman-Outflow";
    } else if (type_flow === 'top10_outflow') {
        setTimeseriesGroup1 = "Datman-Outflow";
        setTimeseriesGroup2 = "Datman-Inflow";
    } else {
        setTimeseriesGroup1 = "Datman";
        setTimeseriesGroup2 = "Datman-Stage";
    }

    setLookBackHours = subtractDaysFromDate(new Date(), 30);
    // beginYear = new Date(${begin}-01-01T06:00:00Z);
    // beginYear_2 = new Date(${begin_2}-01-01T06:00:00Z);
    beginYear = adjustForDST(`${begin}-01-01T07:00:00Z`);
    beginYear_2 = adjustForDST(`${begin}-01-01T07:00:00Z`);
    endYear = new Date((adjustForDST(`${end}-12-31T06:59:00Z`)).getTime() + (60000 * 60 * 24));
    endYear_2 = new Date((adjustForDST(`${end}-12-31T06:59:00Z`)).getTime() + (60000 * 60 * 24));

    // Display the loading indicator for water quality alarm
    const loadingIndicator = document.getElementById(`loading_${reportDiv}`);
    loadingIndicator.style.display = 'block'; // Show the loading indicator

    console.log("setLocationCategory: ", setLocationCategory);
    console.log("setLocationGroupOwner: ", setLocationGroupOwner);
    console.log("setTimeseriesGroup1: ", setTimeseriesGroup1);
    console.log("setTimeseriesGroup2: ", setTimeseriesGroup2);
    console.log("setLookBackHours: ", setLookBackHours);
    console.log("beginYear: ", beginYear);
    console.log("beginYear_2: ", beginYear_2);
    console.log("endYear: ", endYear);
    console.log("endYear_2: ", endYear_2);

    let setBaseUrl = null;
    if (cda === "internal") {
        setBaseUrl = `https://wm.${office.toLowerCase()}.ds.usace.army.mil/${office.toLowerCase()}-data/`;
    } else if (cda === "public") {
        setBaseUrl = `https://cwms-data.usace.army.mil/cwms-data/`;
    }
    console.log("setBaseUrl: ", setBaseUrl);

    // Define the URL to fetch location groups based on category
    const categoryApiUrl = setBaseUrl + `location/group?office=${office}&group-office-id=${office}&category-office-id=${office}&category-id=${setLocationCategory}`;
    console.log("categoryApiUrl: ", categoryApiUrl);

    // Initialize maps to store metadata and time-series ID (TSID) data for various parameters
    const ownerMap = new Map();
    const tsidDatmanMap = new Map();
    const tsidStageRevMap = new Map();

    // Initialize arrays for storing promises
    const ownerPromises = [];
    const datmanTsidPromises = [];
    const stageRevTsidPromises = [];

    // Fetch location group data from the API
    fetch(categoryApiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (!Array.isArray(data) || data.length === 0) {
                console.warn('No data available from the initial fetch.');
                return;
            }

            // Filter and map the returned data to basins belonging to the target category
            const targetCategory = { "office-id": office, "id": setLocationCategory };
            const filteredArray = filterByLocationCategory(data, targetCategory);
            const basins = filteredArray.map(item => item.id);

            if (basins.length === 0) {
                console.warn('No basins found for the given category.');
                return;
            }

            // Initialize an array to store promises for fetching basin data
            const apiPromises = [];
            let combinedData = [];

            // Loop through each basin and fetch data for its assigned locations
            basins.forEach(basin => {
                const basinApiUrl = setBaseUrl + `location/group/${basin}?office=${office}&category-id=${setLocationCategory}`;
                // console.log("basinApiUrl: ", basinApiUrl);

                apiPromises.push(
                    fetch(basinApiUrl)
                        .then(response => {
                            if (!response.ok) {
                                throw new Error(`Network response was not ok for basin ${basin}: ${response.statusText}`);
                            }
                            return response.json();
                        })
                        .then(getBasin => {
                            // console.log('getBasin:', getBasin);

                            if (!getBasin) {
                                // console.log(`No data for basin: ${basin}`);
                                return;
                            }

                            // Filter and sort assigned locations based on 'attribute' field
                            getBasin[`assigned-locations`] = getBasin[`assigned-locations`].filter(location => location.attribute <= 900);
                            getBasin[`assigned-locations`].sort((a, b) => a.attribute - b.attribute);
                            combinedData.push(getBasin);

                            // If assigned locations exist, fetch metadata and time-series data
                            if (getBasin['assigned-locations']) {
                                getBasin['assigned-locations'].forEach(loc => {
                                    // Fetch owner for each location
                                    let ownerApiUrl = setBaseUrl + `location/group/${setLocationGroupOwner}?office=${office}&category-id=${office}`;
                                    // console.log("ownerApiUrl: ", ownerApiUrl);
                                    if (ownerApiUrl) {
                                        ownerPromises.push(
                                            fetch(ownerApiUrl)
                                                .then(response => {
                                                    if (response.status === 404) {
                                                        console.warn(`Datman TSID data not found for location: ${loc['location-id']}`);
                                                        return null;
                                                    }
                                                    if (!response.ok) {
                                                        throw new Error(`Network response was not ok: ${response.statusText}`);
                                                    }
                                                    return response.json();
                                                })
                                                .then(ownerData => {
                                                    if (ownerData) {
                                                        // console.log("ownerData", ownerData);
                                                        ownerMap.set(loc['location-id'], ownerData);
                                                    }
                                                })
                                                .catch(error => {
                                                    console.error(`Problem with the fetch operation for stage TSID data at ${ownerApiUrl}:`, error);
                                                })
                                        );
                                    }

                                    // Fetch datman TSID data
                                    const tsidDatmanApiUrl = setBaseUrl + `timeseries/group/${setTimeseriesGroup1}?office=${office}&category-id=${loc['location-id']}`;
                                    // console.log('tsidDatmanApiUrl:', tsidDatmanApiUrl);
                                    datmanTsidPromises.push(
                                        fetch(tsidDatmanApiUrl)
                                            .then(response => {
                                                if (response.status === 404) return null; // Skip if not found
                                                if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
                                                return response.json();
                                            })
                                            .then(tsidDatmanData => {
                                                // // console.log('tsidDatmanData:', tsidDatmanData);
                                                if (tsidDatmanData) {
                                                    tsidDatmanMap.set(loc['location-id'], tsidDatmanData);
                                                }
                                            })
                                            .catch(error => {
                                                console.error(`Problem with the fetch operation for stage TSID data at ${tsidDatmanApiUrl}:`, error);
                                            })
                                    );

                                    // Fetch stage-rev TSID data
                                    const tsidStageRevApiUrl = setBaseUrl + `timeseries/group/${setTimeseriesGroup2}?office=${office}&category-id=${loc['location-id']}`;
                                    // console.log('tsidStageRevApiUrl:', tsidStageRevApiUrl);
                                    stageRevTsidPromises.push(
                                        fetch(tsidStageRevApiUrl)
                                            .then(response => {
                                                if (response.status === 404) return null; // Skip if not found
                                                if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
                                                return response.json();
                                            })
                                            .then(tsidStageRevData => {
                                                // // console.log('tsidStageRevData:', tsidStageRevData);
                                                if (tsidStageRevData) {
                                                    tsidStageRevMap.set(loc['location-id'], tsidStageRevData);
                                                }
                                            })
                                            .catch(error => {
                                                console.error(`Problem with the fetch operation for stage TSID data at ${tsidStageRevApiUrl}:`, error);
                                            })
                                    );
                                });
                            }
                        })
                        .catch(error => {
                            console.error(`Problem with the fetch operation for basin ${basin}:`, error);
                        })
                );
            });

            // Process all the API calls and store the fetched data
            Promise.all(apiPromises)
                .then(() => Promise.all(ownerPromises))
                .then(() => Promise.all(datmanTsidPromises))
                .then(() => {
                    combinedData.forEach(basinData => {
                        if (basinData['assigned-locations']) {
                            basinData['assigned-locations'].forEach(loc => {
                                // Add owner to json
                                const ownerMapData = ownerMap.get(loc['location-id']);
                                if (ownerMapData) {
                                    loc['owner'] = ownerMapData;
                                }

                                // Add datman to json
                                const tsidDatmanMapData = tsidDatmanMap.get(loc['location-id']);
                                if (tsidDatmanMapData) {
                                    reorderByAttribute(tsidDatmanMapData);
                                    loc['tsid-datman'] = tsidDatmanMapData;
                                } else {
                                    loc['tsid-datman'] = null;  // Append null if missing
                                }

                                // Add stage rev to json
                                const tsidStageRevMapData = tsidStageRevMap.get(loc['location-id']);
                                if (tsidStageRevMapData) {
                                    reorderByAttribute(tsidStageRevMapData);
                                    loc['tsid-stage-rev'] = tsidStageRevMapData;
                                } else {
                                    loc['tsid-stage-rev'] = null;  // Append null if missing
                                }

                                // Initialize empty arrays to hold API and last-value data for various parameters
                                loc['datman-api-data'] = [];
                                loc['datman-last-value'] = [];
                            });
                        }
                    });

                    console.log('combinedData:', combinedData);

                    // // Step 1: Filter out locations where 'attribute' ends with '.1'
                    // combinedData.forEach((dataObj, index) => {
                    //     // console.log(`Processing dataObj at index ${index}:`, dataObj['assigned-locations']);

                    //     // Filter out locations with 'attribute' ending in '.1'
                    //     dataObj['assigned-locations'] = dataObj['assigned-locations'].filter(location => {
                    //         const attribute = location['attribute'].toString();
                    //         if (attribute.endsWith('.1')) {
                    //             // Log the location being removed
                    //             // console.log(`Removing location with attribute '${attribute}' and id '${location['location-id']}' at index ${index}`);
                    //             return false; // Filter out this location
                    //         }
                    //         return true; // Keep the location
                    //     });

                    //     // console.log(`Updated assigned-locations for index ${index}:`, dataObj['assigned-locations']);
                    // });
                    // console.log('Filtered all locations ending with .1 successfully:', combinedData);

                    // Step 2: Filter out locations where 'location-id' doesn't match owner's 'assigned-locations'
                    combinedData.forEach(dataGroup => {
                        // Iterate over each assigned-location in the dataGroup
                        let locations = dataGroup['assigned-locations'];

                        // Loop through the locations array in reverse to safely remove items
                        for (let i = locations.length - 1; i >= 0; i--) {
                            let location = locations[i];

                            // Find if the current location-id exists in owner's assigned-locations
                            let matchingOwnerLocation = location['owner']['assigned-locations'].some(ownerLoc => {
                                return ownerLoc['location-id'] === location['location-id'];
                            });

                            // If no match, remove the location
                            if (!matchingOwnerLocation) {
                                // console.log(`Removing location with id ${location['location-id']} as it does not match owner`);
                                locations.splice(i, 1);
                            }
                        }
                    });

                    console.log('Filtered all locations by matching location-id with owner successfully:', combinedData);

                    // Step 3: Filter out locations where 'tsid-datman' or 'tsid-stage-rev' is null
                    combinedData.forEach(dataGroup => {
                        // Iterate over each assigned-location in the dataGroup
                        let locations = dataGroup['assigned-locations'];

                        // Loop through the locations array in reverse to safely remove items
                        for (let i = locations.length - 1; i >= 0; i--) {
                            let location = locations[i];

                            // Check if 'tsid-datman' or 'tsid-stage-rev' is null or undefined
                            let isLocationNull = location[`tsid-datman`] == null;
                            let isLocationNullStage = location[`tsid-stage-rev`] == null;

                            let matchesGage = false;
                            let matchesGage2 = false;

                            if (!isLocationNull) {
                                matchesGage = location[`tsid-datman`][`assigned-time-series`]?.[0]?.[`timeseries-id`] === gage;
                            }

                            if (!isLocationNullStage) {
                                matchesGage2 = location[`tsid-stage-rev`][`assigned-time-series`]?.[0]?.[`timeseries-id`] === gage_2;
                            }

                            if (isLocationNull || isLocationNullStage || !matchesGage || !matchesGage2) {
                                // console.log(`Removing location with id ${location['location-id']}`);
                                locations.splice(i, 1); // Remove the location from the array
                            }
                        }
                    });

                    console.log('Filtered all locations where tsid is null successfully:', combinedData);

                    // Step 4: Filter out basin where there are no gages
                    combinedData = combinedData.filter(item => item['assigned-locations'] && item['assigned-locations'].length > 0);

                    console.log('Filtered all basin where assigned-locations is null successfully:', combinedData);

                    const timeSeriesDataPromises = [];

                    // Iterate over all arrays in combinedData
                    for (const dataArray of combinedData) {
                        for (const locData of dataArray['assigned-locations'] || []) {
                            // Handle temperature, depth, and DO time series
                            const datmanTimeSeries = locData['tsid-datman']?.['assigned-time-series'] || [];
                            const stageRevTimeSeries = locData['tsid-stage-rev']?.['assigned-time-series'] || [];

                            // Function to create fetch promises for time series data
                            const timeSeriesDataFetchPromises = (datmanTimeSeries, stageRevTimeSeries, type) => {
                                // Combine both time series arrays with a type indicator
                                const combinedTimeSeries = [
                                    ...datmanTimeSeries.map(series => ({ ...series, seriesType: 'datmanTimeSeries' })),
                                    ...stageRevTimeSeries.map(series => ({ ...series, seriesType: 'stageRevTimeSeries' }))
                                ];

                                return combinedTimeSeries.map((series, index) => {
                                    const tsid = series['timeseries-id'];
                                    console.log('tsid:', tsid);
                                    const version = series['timeseries-id'].split('.').pop();
                                    console.log('version:', version);

                                    let timeSeriesDataApiUrl = null;
                                    if (version === "datman-rev") {
                                        timeSeriesDataApiUrl = setBaseUrl + `timeseries?page-size=10000000&name=${tsid}&begin=${beginYear.toISOString()}&end=${endYear.toISOString()}&office=${office}`;
                                        console.log('timeSeriesDataApiUrl:', timeSeriesDataApiUrl);
                                    } else if (version === "lrgsShef-rev" || version === "29") {
                                        timeSeriesDataApiUrl = setBaseUrl + `timeseries?page-size=10000000&name=${tsid}&begin=${beginYear_2.toISOString()}&end=${endYear_2.toISOString()}&office=${office}`;
                                        console.log('timeSeriesDataApiUrl:', timeSeriesDataApiUrl);
                                    } else if (version === "lakerep-rev") {
                                        timeSeriesDataApiUrl = setBaseUrl + `timeseries?page-size=10000000&name=${tsid}&begin=${beginYear.toISOString()}&end=${endYear.toISOString()}&office=${office}`;
                                        console.log('timeSeriesDataApiUrl:', timeSeriesDataApiUrl);
                                    } else {
                                        console.log('Not able to fetch time series data. Check time series version!');
                                    }

                                    return fetch(timeSeriesDataApiUrl, {
                                        method: 'GET',
                                        headers: {
                                            'Accept': 'application/json;version=2'
                                        }
                                    })
                                        .then(res => res.json())
                                        .then(data => {
                                            if (data.values) {
                                                data.values.forEach(entry => {
                                                    entry[0] = formatISODate2ReadableDate(entry[0]);
                                                });
                                            }

                                            // console.log("data: ", data);

                                            // Handle type-specific logic
                                            const apiDataKey = type === 'datman' ? 'datman-api-data' : null;
                                            const lastValueKey = type === 'datman' ? 'datman-last-value' : null;
                                            const maxValueKey = type === 'datman' ? 'datman-max-value' : null;
                                            const minValueKey = type === 'datman' ? 'datman-min-value' : null;
                                            const yearlyValueKey = type === 'datman' ? 'datman-yearly-value' : null;
                                            const yearlyMaxValueKey = type === 'datman' ? 'datman-yearly-max-value' : null;
                                            const yearlyMinValueKey = type === 'datman' ? 'datman-yearly-min-value' : null;

                                            if (!apiDataKey || !lastValueKey || !maxValueKey || !minValueKey) {
                                                console.error('Unknown type:', type);
                                                return; // Early return to avoid processing unknown types
                                            }

                                            locData[apiDataKey] = locData[apiDataKey] || [];
                                            locData[lastValueKey] = locData[lastValueKey] || [];
                                            locData[maxValueKey] = locData[maxValueKey] || [];
                                            locData[minValueKey] = locData[minValueKey] || [];
                                            locData[yearlyValueKey] = locData[yearlyValueKey] || [];
                                            locData[yearlyMaxValueKey] = locData[yearlyMaxValueKey] || [];
                                            locData[yearlyMinValueKey] = locData[yearlyMinValueKey] || [];

                                            locData[apiDataKey].push(data);

                                            // Get and store values for each metric
                                            const lastValue = getLastNonNullValue(data, tsid);
                                            const maxValue = getMaxValue(data, tsid);
                                            const minValue = getMinValue(data, tsid);
                                            const yearlyValue = getYearlyValue(data, tsid);
                                            const yearlyMaxValue = getYearlyMaxValue(data, tsid);
                                            const yearlyMinValue = getYearlyMinValue(data, tsid);

                                            locData[lastValueKey].push(lastValue);
                                            locData[maxValueKey].push(maxValue);
                                            locData[minValueKey].push(minValue);
                                            locData[yearlyValueKey].push(yearlyValue);
                                            locData[yearlyMaxValueKey].push(yearlyMaxValue);
                                            locData[yearlyMinValueKey].push(yearlyMinValue);
                                        })
                                        .catch(error => {
                                            console.error(`Error fetching additional data for location ${locData['location-id']} with TSID ${tsid}:`, error);
                                        });
                                });
                            };

                            // Create promises for datman, stage-rev time series
                            const datmanPromises = timeSeriesDataFetchPromises(datmanTimeSeries, stageRevTimeSeries, 'datman');

                            const timeSeriesDataExtentsApiCall = async (type) => {
                                const extentsApiUrl = setBaseUrl + `catalog/TIMESERIES?page-size=5000&office=${office}`;
                                // console.log('extentsApiUrl:', extentsApiUrl);

                                try {
                                    const res = await fetch(extentsApiUrl, {
                                        method: 'GET',
                                        headers: {
                                            'Accept': 'application/json;version=2'
                                        }
                                    });
                                    const data = await res.json();
                                    locData['extents-api-data'] = data;
                                    locData[`extents-data`] = {};

                                    // Collect TSIDs from both datman and stageRev time series
                                    const datmanTids = datmanTimeSeries.map(series => series['timeseries-id']);
                                    const stageRevTids = stageRevTimeSeries.map(series => series['timeseries-id']);
                                    const allTids = [...datmanTids, ...stageRevTids]; // Combine both arrays

                                    allTids.forEach((tsid, index) => {
                                        const matchingEntry = data.entries.find(entry => entry['name'] === tsid);
                                        if (matchingEntry) {
                                            // Convert times from UTC
                                            let latestTimeUTC = matchingEntry.extents[0]?.['latest-time'];
                                            let earliestTimeUTC = matchingEntry.extents[0]?.['earliest-time'];

                                            // Convert UTC times to Date objects
                                            let latestTimeCST = new Date(latestTimeUTC);
                                            let earliestTimeCST = new Date(earliestTimeUTC);

                                            // Function to format date as "MM-DD-YYYY HH:mm"
                                            const formatDate = (date) => {
                                                return date.toLocaleString('en-US', {
                                                    timeZone: 'America/Chicago', // Set the timezone to Central Time (CST/CDT)
                                                    month: '2-digit',
                                                    day: '2-digit',
                                                    year: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    hour12: false // Use 24-hour format
                                                }).replace(',', ''); // Remove the comma from the formatted string
                                            };

                                            // Format the times to CST/CDT
                                            let formattedLatestTime = formatDate(latestTimeCST);
                                            let formattedEarliestTime = formatDate(earliestTimeCST);

                                            // Construct the _data object with formatted times
                                            let _data = {
                                                office: matchingEntry.office,
                                                name: matchingEntry.name,
                                                earliestTime: formattedEarliestTime, // Use formatted earliestTime
                                                earliestTimeISO: earliestTimeCST.toISOString(), // Store original ISO format as well
                                                lastUpdate: matchingEntry.extents[0]?.['last-update'],
                                                latestTime: formattedLatestTime, // Use formatted latestTime
                                                latestTimeISO: latestTimeCST.toISOString(), // Store original ISO format as well
                                                tsid: matchingEntry['timeseries-id'],
                                            };

                                            // Determine extent key based on tsid
                                            let extent_key;
                                            if (tsid.includes('Stage') || tsid.includes('Elev') || tsid.includes('Flow') || tsid.includes('Conc-DO')) {
                                                extent_key = 'datman';
                                            } else {
                                                return; // Ignore if it doesn't match the condition
                                            }

                                            // Update locData with extents-data
                                            if (!locData[`extents-data`][extent_key]) {
                                                locData[`extents-data`][extent_key] = [_data];
                                            } else {
                                                locData[`extents-data`][extent_key].push(_data);
                                            }

                                        } else {
                                            console.warn(`No matching entry found for TSID: ${tsid}`);
                                        }
                                    });
                                } catch (error) {
                                    console.error(`Error fetching additional data for location ${locData['location-id']}:`, error);
                                }
                            };

                            // Combine all promises for this location
                            timeSeriesDataPromises.push(Promise.all([...datmanPromises, timeSeriesDataExtentsApiCall()]));
                        }
                    }

                    // Wait for all additional data fetches to complete
                    return Promise.all(timeSeriesDataPromises);
                })
                .then(() => {
                    console.log('All combinedData data fetched successfully:', combinedData);

                    // ******************** plot porMax table *****************************************
                    // const porMax = combinedData[0][`assigned-locations`][0][`datman-max-value`];
                    // console.log(combinedData[0][`assigned-locations`][0][`datman-max-value`]);

                    // const tableBody = document.querySelector("#data-table tbody");

                    // porMax.forEach(item => {
                    //     const row = document.createElement("tr");

                    //     // Create cells and append data
                    //     const tsidCell = document.createElement("td");
                    //     tsidCell.textContent = item.tsid;
                    //     row.appendChild(tsidCell);

                    //     const timestampCell = document.createElement("td");
                    //     timestampCell.textContent = item.timestamp;
                    //     row.appendChild(timestampCell);

                    //     const valueCell = document.createElement("td");
                    //     valueCell.textContent = item.value.toFixed(2); // Format to 2 decimal places
                    //     row.appendChild(valueCell);

                    //     const qualityCodeCell = document.createElement("td");
                    //     qualityCodeCell.textContent = item.qualityCode;
                    //     row.appendChild(qualityCodeCell);

                    //     tableBody.appendChild(row);
                    // });

                    // ******************** plot top10 table *****************************************
                    if (type_flow === "top10_inflow" || type_flow === "top10_outflow") {
                        const table = createTableTop10Flow(combinedData, type, type_flow);
                        const container = document.getElementById(`table_container_${reportDiv}`);
                        container.appendChild(table);

                        const table2 = createTableTop10SortedFlow(combinedData, type, top10, type_flow);
                        const container2 = document.getElementById(`table_container_top10_sorted`);
                        container2.appendChild(table2);
                    } else {
                        const table = createTableTop10(combinedData, type, type_flow, top10);
                        const container = document.getElementById(`table_container_${reportDiv}`);
                        container.appendChild(table);

                        const table2 = createTableTop10Sorted(combinedData, type, top10, type_flow);
                        const container2 = document.getElementById(`table_container_top10_sorted`);
                        container2.appendChild(table2);
                    }

                    loadingIndicator.style.display = 'none';
                })
                .catch(error => {
                    console.error('There was a problem with one or more fetch operations:', error);
                    loadingIndicator.style.display = 'none';
                });

        })
        .catch(error => {
            console.error('There was a problem with the initial fetch operation:', error);
            loadingIndicator.style.display = 'none';
        });

    function filterByLocationCategory(array, setLocationCategory) {
        return array.filter(item =>
            item['location-category'] &&
            item['location-category']['office-id'] === setLocationCategory['office-id'] &&
            item['location-category']['id'] === setLocationCategory['id']
        );
    }

    function subtractDaysFromDate(date, daysToSubtract) {
        return new Date(date.getTime() - (daysToSubtract * 24 * 60 * 60 * 1000));
    }

    function formatISODate2ReadableDate(timestamp) {
        const date = new Date(timestamp);
        const mm = String(date.getMonth() + 1).padStart(2, '0'); // Month
        const dd = String(date.getDate()).padStart(2, '0'); // Day
        const yyyy = date.getFullYear(); // Year
        const hh = String(date.getHours()).padStart(2, '0'); // Hours
        const min = String(date.getMinutes()).padStart(2, '0'); // Minutes
        return `${mm}-${dd}-${yyyy} ${hh}:${min}`;
    }

    const reorderByAttribute = (data) => {
        data['assigned-time-series'].sort((a, b) => a.attribute - b.attribute);
    }

    function getLastNonNullValue(data, tsid) {
        // Iterate over the values array in reverse
        for (let i = data.values.length - 1; i >= 0; i--) {
            // Check if the value at index i is not null
            if (data.values[i][1] !== null) {
                // Return the non-null value as separate variables
                return {
                    tsid: tsid,
                    timestamp: data.values[i][0],
                    value: data.values[i][1],
                    qualityCode: data.values[i][2]
                };
            }
        }
        // If no non-null value is found, return null
        return null;
    }

    function getMaxValue(data, tsid) {
        let maxValue = -Infinity; // Start with the smallest possible value
        let maxEntry = null; // Store the corresponding max entry (timestamp, value, quality code)

        // console.log("data: ", data);

        // Loop through the values array
        for (let i = 0; i < data.values.length; i++) {
            const currentValue = data.values[i][1];

            // Check if the currentValue is neither null nor undefined
            if (currentValue != null) { // This covers both null and undefined
                // Update maxValue and maxEntry if the current value is greater
                if (currentValue > maxValue) {
                    maxValue = currentValue;
                    maxEntry = {
                        tsid: tsid,
                        timestamp: data.values[i][0],
                        value: currentValue,
                        qualityCode: data.values[i][2]
                    };
                }
            }
        }

        // Return the max enty (or null if no valid values were found)
        return maxEntry;
    }

    function getYearlyValue(data, tsid) {
        const yearlyValues = {}; // Object to group values by year

        // Loop through the values array
        for (let i = 0; i < data.values.length; i++) {
            const entry = data.values[i];
            const timestamp = entry[0];
            const value = entry[1];
            const qualityCode = entry[2];

            // Parse the year from the timestamp
            const year = new Date(timestamp).getFullYear();

            // Skip entries with null or undefined values
            if (value != null) {
                // Initialize the year array if not already present
                if (!yearlyValues[year]) {
                    yearlyValues[year] = [];
                }

                // Add the current entry to the appropriate year array
                yearlyValues[year].push({
                    tsid: tsid,
                    timestamp: timestamp,
                    value: value,
                    qualityCode: qualityCode
                });
            }
        }

        return yearlyValues;
    }

    function getYearlyMaxValue(data, tsid) {
        const yearlyMax = {}; // Object to store the maximum value for each year

        // Loop through the values array
        for (let i = 0; i < data.values.length; i++) {
            const entry = data.values[i];
            const timestamp = entry[0];
            const value = entry[1];
            const qualityCode = entry[2];

            // Parse the year from the timestamp
            const year = new Date(timestamp).getFullYear();

            // Skip entries with null or undefined values
            if (value != null) {
                // Initialize the max for the year if not already present
                if (!yearlyMax[year]) {
                    yearlyMax[year] = { value: -Infinity, entry: null };
                }

                // Update the maximum value for the year if needed
                if (value > yearlyMax[year].value) {
                    yearlyMax[year] = {
                        value: value,
                        entry: {
                            tsid: tsid,
                            timestamp: timestamp,
                            value: value,
                            qualityCode: qualityCode
                        }
                    };
                }
            }
        }

        return yearlyMax;
    }

    function getYearlyMinValue(data, tsid) {
        const yearlyMin = {}; // Object to store the minimum value for each year

        // Loop through the values array
        for (let i = 0; i < data.values.length; i++) {
            const entry = data.values[i];
            const timestamp = entry[0];
            const value = entry[1];
            const qualityCode = entry[2];

            // Parse the year from the timestamp
            const year = new Date(timestamp).getFullYear();

            // Skip entries with null or undefined values
            if (value != null) {
                // Initialize the min for the year if not already present
                if (!yearlyMin[year]) {
                    yearlyMin[year] = { value: Infinity, entry: null };
                }

                // Update the minimum value for the year if needed
                if (value < yearlyMin[year].value) {
                    yearlyMin[year] = {
                        value: value,
                        entry: {
                            tsid: tsid,
                            timestamp: timestamp,
                            value: value,
                            qualityCode: qualityCode
                        }
                    };
                }
            }
        }

        return yearlyMin;
    }

    function getMinValue(data, tsid) {
        let minValue = Infinity; // Start with the largest possible value
        let minEntry = null; // Store the corresponding min entry (timestamp, value, quality code)

        // Loop through the values array
        for (let i = 0; i < data.values.length; i++) {
            // Check if the value at index i is not null
            if (data.values[i][1] !== null) {
                // Update minValue and minEntry if the current value is smaller
                if (data.values[i][1] < minValue) {
                    minValue = data.values[i][1];
                    minEntry = {
                        tsid: tsid,
                        timestamp: data.values[i][0],
                        value: data.values[i][1],
                        qualityCode: data.values[i][2]
                    };
                }
            }
        }

        // Return the min entry (or null if no valid values were found)
        return minEntry;
    }

    function createTableTop10(data, type, type_flow, top10) {
        const table = document.createElement('table');
        table.id = 'customers';

        console.log("data: ", data);
        console.log("type: ", type);
        console.log("type_flow: ", type_flow);
        console.log("top10: ", top10);

        const showAllRows = type === 'status' || type === 'top10';

        data.forEach(item => {
            let shouldPrintHeader = false;

            item['assigned-locations'].forEach(location => {

                let datmanData = null;
                if (top10 === "max") {
                    datmanData = location['datman-yearly-max-value'] || [];
                } else if (top10 === "min") {
                    datmanData = location['datman-yearly-min-value'] || [];
                } else {
                    datmanData = location['datman-yearly-value'] || [];
                }

                // Group data by year
                const groupedData = {};

                // Populate groupedData with values for each year
                datmanData.forEach(datmanEntry => {
                    Object.entries(datmanEntry).forEach(([year, entry]) => {
                        if (!groupedData[year]) {
                            groupedData[year] = { datman1: null, datman2: null }; // Initialize with nulls
                        }

                        // Assign both datman1 and datman2 for each year, ensuring nulls are handled
                        if (groupedData[year].datman1 === null) {
                            groupedData[year].datman1 = entry;
                        } else if (groupedData[year].datman2 === null) {
                            groupedData[year].datman2 = entry;
                        }
                    });
                });

                console.log("groupedData: ", groupedData);

                // Ensure all years have exactly two objects
                Object.keys(groupedData).forEach(year => {
                    groupedData[year].datman1 = groupedData[year].datman1 ?? null;
                    groupedData[year].datman2 = groupedData[year].datman2 ?? null;
                });

                // console.log("groupedData: ", groupedData);

                if (!shouldPrintHeader) {
                    const headerRow = document.createElement('tr');
                    const idHeader = document.createElement('th');
                    idHeader.colSpan = 6;
                    idHeader.textContent = item.id;
                    headerRow.appendChild(idHeader);
                    table.appendChild(headerRow);

                    const subHeaderRow = document.createElement('tr');
                    ['Year', 'Datman Value', 'Datman Timestamp', 'StageRev Value', 'StageRev Timestamp'].forEach(headerText => {
                        const td = document.createElement('td');
                        td.textContent = headerText;
                        subHeaderRow.appendChild(td);
                    });
                    table.appendChild(subHeaderRow);

                    shouldPrintHeader = true;
                }

                // Loop through grouped data and create rows
                Object.keys(groupedData).forEach(year => {
                    const yearData = groupedData[year];

                    const datman1Value = yearData.datman1 ? yearData.datman1.value.toFixed(2) : 'N/A';
                    const datman1Timestamp = yearData.datman1 ? yearData.datman1.entry.timestamp : 'N/A';

                    const datman2Value = yearData.datman2 ? yearData.datman2.value.toFixed(2) : 'N/A';
                    const datman2Timestamp = yearData.datman2 ? yearData.datman2.entry.timestamp : 'N/A';

                    const valueSpan1 = document.createElement('span');
                    valueSpan1.classList.toggle('blinking-text', datman1Value === 'N/A');
                    valueSpan1.textContent = datman1Value;

                    const valueSpan2 = document.createElement('span');
                    valueSpan2.classList.toggle('blinking-text', datman2Value === 'N/A');
                    valueSpan2.textContent = datman2Value;

                    const createDataRow = (cells) => {
                        const dataRow = document.createElement('tr');
                        cells.forEach(cellValue => {
                            const cell = document.createElement('td');
                            if (cellValue instanceof HTMLElement) {
                                cell.appendChild(cellValue);
                            } else {
                                cell.textContent = cellValue;
                            }
                            dataRow.appendChild(cell);
                        });
                        table.appendChild(dataRow);
                    };

                    createDataRow([year, valueSpan1, datman1Timestamp, valueSpan2, datman2Timestamp]);
                });
            });
        });

        return table;
    }

    function createTableTop10Sorted(data, type, top10, type_flow) {
        const table = document.createElement('table');
        table.id = 'customers';
        table.style.width = '50%'; // Set the table width to 50%

        let rowIndex = 0; // To keep track of the row index

        // console.log("type: ", type);
        // console.log("top10: ", top10);

        data.forEach(item => {
            let shouldPrintHeader = false;

            item['assigned-locations'].forEach(location => {

                let datmanData = null;
                if (top10 === "max") {
                    datmanData = location['datman-yearly-max-value'] || [];
                } else if (top10 === "min") {
                    datmanData = location['datman-yearly-min-value'] || [];
                } else {
                    datmanData = location['datman-yearly-value'] || [];
                }

                // Group data by year
                const groupedData = {};

                // Populate groupedData with values for each year
                datmanData.forEach(datmanEntry => {
                    Object.entries(datmanEntry).forEach(([year, entry]) => {
                        if (!groupedData[year]) {
                            groupedData[year] = {};
                        }
                        // Assign both datman1 and datman2 for each year
                        if (!groupedData[year].datman1) {
                            groupedData[year].datman1 = entry;
                        } else {
                            groupedData[year].datman2 = entry;
                        }
                    });
                });

                if (!shouldPrintHeader) {
                    const headerRow = document.createElement('tr');
                    const idHeader = document.createElement('th');
                    idHeader.colSpan = 4;
                    idHeader.textContent = location[`location-id`];
                    headerRow.appendChild(idHeader);
                    table.appendChild(headerRow);

                    const subHeaderRow = document.createElement('tr');
                    const valueType = top10 === "min" ? "Min Value" : "Max Value"; // Dynamically set header

                    ['Year', valueType, 'Timestamp'].forEach(headerText => {
                        const td = document.createElement('td');
                        td.textContent = headerText;
                        subHeaderRow.appendChild(td);
                    });

                    table.appendChild(subHeaderRow);
                    shouldPrintHeader = true;
                }

                // Sort groupedData based on the value of top10
                const sortedYears = Object.keys(groupedData).sort((a, b) => {
                    const getMaxValue = (data) =>
                        Math.max(
                            data.datman1?.value ?? -Infinity,
                            data.datman2?.value ?? -Infinity
                        );

                    const getMinValue = (data) =>
                        Math.min(
                            data.datman1?.value ?? Infinity,
                            data.datman2?.value ?? Infinity
                        );

                    const getValue = top10 === "min" ? getMinValue : getMaxValue;

                    const valueA = getValue(groupedData[a]);
                    const valueB = getValue(groupedData[b]);

                    // Sort in ascending order for min, descending for max
                    return top10 === "min" ? valueA - valueB : valueB - valueA;
                });


                // Loop through sorted years and create rows
                sortedYears.forEach(year => {
                    const yearData = groupedData[year];

                    // Extract values and timestamps
                    const datman1Value = yearData.datman1 ? yearData.datman1.value : (top10 === "min" ? Infinity : -Infinity);
                    const datman1Timestamp = yearData.datman1 ? yearData.datman1.entry.timestamp : null;

                    const datman2Value = yearData.datman2 ? yearData.datman2.value : (top10 === "min" ? Infinity : -Infinity);
                    const datman2Timestamp = yearData.datman2 ? yearData.datman2.entry.timestamp : null;

                    // Determine whether to find min or max
                    const value = top10 === "min" ? Math.min(datman1Value, datman2Value) : Math.max(datman1Value, datman2Value);
                    const timestamp = value === datman1Value ? datman1Timestamp : datman2Timestamp;

                    const valueSpan = document.createElement('span');

                    // Add blinking-text class if the value exceeds thresholds
                    if (value > 900 || value < -900) {
                        valueSpan.classList.add('blinking-text');
                    }

                    valueSpan.textContent = (value !== Infinity && value !== -Infinity) ? value.toFixed(2) : 'N/A';

                    const createDataRow = (cells) => {
                        const dataRow = document.createElement('tr');
                        if (rowIndex < 10) {
                            dataRow.style.backgroundColor = 'lightblue'; // Highlight first 10 rows
                        }
                        cells.forEach(cellValue => {
                            const cell = document.createElement('td');
                            if (cellValue instanceof HTMLElement) {
                                cell.appendChild(cellValue);
                            } else {
                                cell.textContent = cellValue;
                            }
                            dataRow.appendChild(cell);
                        });
                        table.appendChild(dataRow);
                        rowIndex++; // Increment the row index
                    };

                    createDataRow([year, valueSpan, timestamp || 'N/A']);
                });
            });
        });

        return table;
    }

    function createTableTop10SortedFlow(data, type, top10, type_flow) {
        const table = document.createElement('table');
        table.id = 'customers';
        table.style.width = '50%'; // Set the table width to 50%

        let rowIndex = 0; // To keep track of the row index

        data.forEach(item => {
            let shouldPrintHeader = false;

            item['assigned-locations'].forEach(location => {
                const datmanData = location['datman-yearly-max-value'] || [];

                // Group data by year
                const groupedData = {};

                // Populate groupedData with values for each year
                datmanData.forEach(datmanEntry => {
                    Object.entries(datmanEntry).forEach(([year, entry]) => {
                        if (!groupedData[year]) {
                            groupedData[year] = {};
                        }
                        // Assign only datman1 for each year
                        if (!groupedData[year].datman1) {
                            groupedData[year].datman1 = entry;
                        }
                    });
                });

                if (!shouldPrintHeader) {
                    const headerRow = document.createElement('tr');
                    const idHeader = document.createElement('th');
                    idHeader.colSpan = 3; // Adjust for 3 columns (Year, Max Value, Timestamp)
                    idHeader.textContent = location[`location-id`];
                    headerRow.appendChild(idHeader);
                    table.appendChild(headerRow);

                    const subHeaderRow = document.createElement('tr');
                    ['Year', 'Max Value', 'Timestamp'].forEach(headerText => {
                        const td = document.createElement('td');
                        td.textContent = headerText;
                        subHeaderRow.appendChild(td);
                    });
                    table.appendChild(subHeaderRow);

                    shouldPrintHeader = true;
                }

                // Sort groupedData based on the value of top10
                const sortedYears = Object.keys(groupedData).sort((a, b) => {
                    const maxValueA = groupedData[a].datman1?.value || -Infinity;
                    const maxValueB = groupedData[b].datman1?.value || -Infinity;

                    // Sort descending for "max", ascending for "min"
                    return top10 === "min" ? maxValueA - maxValueB : maxValueB - maxValueA;
                });

                // Loop through sorted years and create rows
                sortedYears.forEach(year => {
                    const yearData = groupedData[year];

                    // Determine the value and timestamp for datman1
                    const datman1Value = yearData.datman1 ? yearData.datman1.value : -Infinity;
                    const datman1Timestamp = yearData.datman1 ? yearData.datman1.entry.timestamp : null;

                    const valueSpan = document.createElement('span');

                    // Add blinking-text class if datman1Value is greater than 900 or less than -900
                    if (datman1Value > 500000 || datman1Value < -500000) {
                        valueSpan.classList.add('blinking-text');
                    }

                    valueSpan.textContent = datman1Value !== -Infinity ? datman1Value.toFixed(0) : 'N/A';

                    const createDataRow = (cells) => {
                        const dataRow = document.createElement('tr');
                        if (rowIndex < 10) {
                            dataRow.style.backgroundColor = 'lightblue'; // Highlight first 10 rows
                        }
                        cells.forEach(cellValue => {
                            const cell = document.createElement('td');
                            if (cellValue instanceof HTMLElement) {
                                cell.appendChild(cellValue);
                            } else {
                                cell.textContent = cellValue;
                            }
                            dataRow.appendChild(cell);
                        });
                        table.appendChild(dataRow);
                        rowIndex++; // Increment the row index
                    };

                    createDataRow([year, valueSpan, datman1Timestamp || 'N/A']);
                });
            });
        });

        return table;
    }

    function adjustForDST(dateStr) {
        // console.log(`Input date string (expected UTC): ${dateStr}`);

        const date = new Date(dateStr);
        // console.log(`Parsed date (local): ${date}`);
        // console.log(`Parsed date (UTC): ${date.toUTCString()}`);

        const januaryOffset = new Date(date.getUTCFullYear(), 0, 1).getTimezoneOffset();
        // console.log(`UTC offset on January 1st (standard time): ${januaryOffset} minutes`);

        const currentOffset = date.getTimezoneOffset();
        // console.log(`UTC offset for input date: ${currentOffset} minutes`);

        const isDST = currentOffset < januaryOffset;
        // console.log(`Is the date in DST? ${isDST}`);

        const adjustedDate = isDST ? date : new Date(date.getTime() - (60 * 60 * 1000));
        // console.log(`Adjusted date (local): ${adjustedDate}`);
        // console.log(`Adjusted date (UTC): ${adjustedDate.toUTCString()}`);

        return adjustedDate;
    }

    function createTableTop10Flow(data, type, type_flow) {
        const table = document.createElement('table');
        table.id = 'customers';

        const showAllRows = type === 'status' || type === 'top10';

        data.forEach(item => {
            let shouldPrintHeader = false;

            item['assigned-locations'].forEach(location => {
                const datmanData = location['datman-yearly-max-value'] || [];

                // Group data by year
                const groupedData = {};

                // Populate groupedData with values for each year
                datmanData.forEach(datmanEntry => {
                    Object.entries(datmanEntry).forEach(([year, entry]) => {
                        if (!groupedData[year]) {
                            groupedData[year] = { datman1: null }; // Initialize with null
                        }
                        if (groupedData[year].datman1 === null) {
                            groupedData[year].datman1 = entry;
                        }
                    });
                });

                if (!shouldPrintHeader) {
                    const headerRow = document.createElement('tr');
                    const idHeader = document.createElement('th');
                    idHeader.colSpan = 3; // Adjust for 3 columns (Year, Datman Value, Datman Timestamp)
                    idHeader.textContent = item.id;
                    headerRow.appendChild(idHeader);
                    table.appendChild(headerRow);

                    const subHeaderRow = document.createElement('tr');
                    const headers = ['Year', 'Datman Value', 'Datman Timestamp'];
                    headers.forEach(headerText => {
                        const td = document.createElement('td');
                        td.textContent = headerText;
                        subHeaderRow.appendChild(td);
                    });
                    table.appendChild(subHeaderRow);

                    shouldPrintHeader = true;
                }

                // Loop through grouped data and create rows
                Object.keys(groupedData).forEach(year => {
                    const yearData = groupedData[year];

                    const datman1Value = yearData.datman1 ? yearData.datman1.value.toFixed(0) : 'N/A';
                    const datman1Timestamp = yearData.datman1 ? yearData.datman1.entry.timestamp : 'N/A';

                    const valueSpan1 = document.createElement('span');
                    valueSpan1.classList.toggle('blinking-text', datman1Value === 'N/A');
                    valueSpan1.textContent = datman1Value;

                    const cells = [year, valueSpan1, datman1Timestamp];

                    const createDataRow = (cells) => {
                        const dataRow = document.createElement('tr');
                        cells.forEach(cellValue => {
                            const cell = document.createElement('td');
                            if (cellValue instanceof HTMLElement) {
                                cell.appendChild(cellValue);
                            } else {
                                cell.textContent = cellValue;
                            }
                            dataRow.appendChild(cell);
                        });
                        table.appendChild(dataRow);
                    };

                    createDataRow(cells);
                });
            });
        });

        return table;
    }
});