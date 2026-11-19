# Address book

A web browser application to manage all your contacts in a simple modern UI built as a JavaScript browser application using modern JavaScript and ESM.

Application is displayed consuming 100% browser client area without the browser chrome, designed to look and feel like a native app.

## Core technology

- Browser application targeting modern recent browsers.
- Built with modern JavaScript and ESM.
- Use only Vite and only pure JavaScript, do not use any framework.
- Responsive design, app should render well on desktop, tablet, and mobile devices.
- Address data is stored in local storage as a JSON object using the schema description in the file [address-book-schema.json](./address-book-schema.json). User settings are persisted in local storage as a separate object from the address data.
- Support for add to home screen: adds a manifest file and other resources required to support standalone launch mode.
- Ability to work offline without an Internet connection by using service workers and caching required resources locally.

## Main display

The main display shows the list of contacts in one of two possible views:

- Tree view, left column is each alpha a-z. Expanding an alpha entry displays a table of addresses sorted by that alpha. Each entry one per line dislays address.category as an icon, address.name.photo, address.name.first, address.name.last, and a cell justified right with an edit button.
- Card view, displays each address entry in a card view with top row address.category as an icon, address.name.photo, address.name.first, address.name.last; business or home address; address[i].contacts.type as a drop-list and address string or the drop-list current selection.

Other UI controls

- View - button to toggle between tree view and card view.
- Alpha bar - a strip of small buttons for each alpha character, A-Z and asteriks for any other character, that when clicked filters the current view to show all address book entries by the indicated alpha character.
- Search - search the list for a given string. The search button when clicked prompts the user for a search string entered with the keyboard. The search operates a case-insensitive search against any data in the address data file and displays a list view of all address entries that match that search string.

Navigation buttons appear in a navigation tray at the bottom of the view:

- New - create a new address entry.
- Edit - edit the selected address entry.
- Delete - delete the selected address entry.
- Map - show the map view screen centered on the current device location.
- Settings - show the application settings screen.

When a person card or person row is clicked then show a display contact screen that displays all of the contact information available for that entry using the same layout as the address edit form.

## Screens

The following screens can be navigated from the main screen.

### Display contact screen

Click a person card or row, or focus it and press Enter or Space, to view the contact without editing. The screen uses the edit form's person, contact methods, and address sections, and displays all saved contact methods, notes, and additional information. Back to contacts (or Escape) returns to the current list and filters; Edit contact opens the populated edit form. Embedded edit buttons, map pins, contact links, and contact-method dropdowns retain their own actions.

### New and edit address screen

Display an address entry form. With New, a blank form. With Edit, the form is populated with the data from the indicated address entry. Save and Cancel buttons.

### Settings screen

Settings include the following UI controls:

- Default view: A Combo-box with two choices, Card view or List view, the setting is used as the default view when the app opens.
- Alpha bar placement: Combo-box with 4 options
  - Right (default): alpha bar is placed vertically pinned to the right-side of the client window.
  - Left: alpha bar is placed vertically pinned to the left-side of the client window.
  - Top: alpha bar is placed horizontally pinned to the top of the client window.
  - Bottom: alpha bar is placed horizontally pinned to the bottom of the client window but above the navigation tray.
- Sort: combo-box that indicates which address field is used to sort the alpha entries (choices are first name, last name, company)
- Map-type: indicates which arcgis map style is used when the map page loads. The user may select one style from the arcgis styles: navigation, navigation-night, streets-relief, streets-night, outdoor, imagery. Use a small 50x50 square thumbnail image along with the style name to represet each choice. When the map loads it uses this style.

- Import: button that opens the import screen
- Export: button that opens the export screen

Add to the Settings screen a new Identify Duplicates section. Identify duplicates: find duplicate address book entries based on last name and telephone number or email address. When clicked, present a new screen that displays all address book entries that may be duplicates based on the last name matching another address book entry and one of the telephone number or email address also match the same address book entry. The duplicate entries can be merged or deleted. Merge means the user selects one entry to keep and then combine all non-empty properties into the users selected entry and delete the unselected entries. Delete means the user selects one entry to keep and the other matching entries are deleted.

Persist the users settings. Save the user settings in a localstorage JSON object and restore the user settings when the app launches.

### Map screen

There are two ways to load the map screen:

- From the main navigation menu.
- From a contact entry when it has an address.

When clicked from the navigation menu, the map loads using the current device location as the initial viewpoint. When loaded from a contact entry, use the contact address as the initial viewpoint.

## Import / export

When the user clicks the Import button a dialog is presented to ask the user how to import the address book data.
- Replace address book: removes all existng contacts and then import new contacts.
- Add to address book: keep current contacts and add imported ones. For this option there is an additional radio button with 3 mutually exclusive options:
  - import and merge: when importing a file, try to match each contact based on phone number or email address. If the imported contact matches an existing contact then only replace a field in the existing contact if it is empty and the imported contact field is not empty. Any contact in the imported data that does not match an existing contact is imported as a new contact.
  - import and replace: when importing a file, try to match each contact based on phone number or email address. If the imported contact matches an existing contact then the imported data replaces the entire existing contact. Any contact in the imported data that does not match an existing contact is imported as a new contact.
  - import and match: when importing a file, try to match each contact based on phone number or email address. If the imported contact matches an existing contact then only replace a field in the existing contact if it is empty and the imported contact field is not empty. Any contact in the imported data that does not match an existing contact is ignored.

Import then prompts the user for a file to import. The file type will be used to determine the data type of the file data:

- import CSV
- import VCF
- import JSON
- import YAML

Export prompts the user for a file name. The file type will determined the file format of the exported data:

- export CSV
- export JSON

## Address map

On the address card or on the address in list view, there is a pin button next to the address. When the pin is clicked, open a new view that will load an ArcGIS Maps SDK for JavaScript map using the full client area (100% client area below the application header with no margin or padding). The basemap to load is the saved setting for map-type. The map is centered on the location of the address of the contact that was clicked.

Add Search component top-right.

When the map loads and an initial location is provided, show a popup anchored to the initial map location. Use a popup template in order to custom style the popup. The popup div has rounded corners and the body background color. Show the Contact Name in the title with bold and 1 pt larger font, and the address in regular font in the content area. Include a Route button in the bottom right corner of the popup that when clicked will invoke the Directions Component with this initial location as the first stop. The Route button uses the Calcite icon location-sharing.

Long press - when the user long-presses on the map, a context popup menu appears with the following menu options:

- route: show the route component.
- details: show location details.
- track: start the track recorder.
- (if track is active) end track: ends the track recording.

### Directions component

The Directions component uses the arcgis-directions component. It will set the directions component with start location set to the current location of the device, and the first stop is set to the address at the initial location the map was loaded with.

### Location details

### Track recorder

center map on your current location to begin recording a GPS track. when tracking is active, a graphics layer is added to the map with a start location marker. The device location is sampled once per second. Each sample is added to a location tracking object with a timestamp and the location coordinates, and the graphics layer is updated with a polyline graphic symbol rendering the track.

Updates the graphics layer with the start marker and end marker, and save the tracking coordinates object.

## to do

- test import match
- load and sync contacts with JSON file URL
- track record
- add saved tracks to Settings?
