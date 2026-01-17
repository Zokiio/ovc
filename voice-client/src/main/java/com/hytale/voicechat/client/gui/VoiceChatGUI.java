package com.hytale.voicechat.client.gui;

import com.hytale.voicechat.client.VoiceChatClient;
import javafx.application.Application;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.GridPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;

/**
 * JavaFX GUI for the voice chat client
 */
public class VoiceChatGUI extends Application {
    private VoiceChatClient client;
    private TextField usernameField;
    private TextField serverAddressField;
    private TextField serverPortField;
    private Button connectButton;
    private Label statusLabel;
    private Slider volumeSlider;

    @Override
    public void start(Stage primaryStage) {
        client = new VoiceChatClient();

        primaryStage.setTitle("Hytale Voice Chat");
        primaryStage.setScene(createScene());
        primaryStage.setOnCloseRequest(e -> {
            if (client.isConnected()) {
                client.disconnect();
            }
        });
        primaryStage.show();
    }

    private Scene createScene() {
        VBox root = new VBox(10);
        root.setPadding(new Insets(15));
        root.setAlignment(Pos.TOP_CENTER);

        // Connection panel
        GridPane connectionPanel = new GridPane();
        connectionPanel.setHgap(10);
        connectionPanel.setVgap(10);
        connectionPanel.setAlignment(Pos.CENTER);

        Label usernameLabel = new Label("Username:");
        usernameField = new TextField(System.getProperty("user.name"));
        usernameField.setPrefWidth(200);

        Label addressLabel = new Label("Server Address:");
        serverAddressField = new TextField("localhost");
        serverAddressField.setPrefWidth(200);

        Label portLabel = new Label("Port:");
        serverPortField = new TextField("24454");
        serverPortField.setPrefWidth(100);

        connectButton = new Button("Connect");
        connectButton.setOnAction(e -> handleConnect());

        connectionPanel.add(usernameLabel, 0, 0);
        connectionPanel.add(usernameField, 1, 0);
        connectionPanel.add(addressLabel, 0, 1);
        connectionPanel.add(serverAddressField, 1, 1);
        connectionPanel.add(portLabel, 0, 2);
        connectionPanel.add(serverPortField, 1, 2);
        connectionPanel.add(connectButton, 1, 3);

        // Status panel
        statusLabel = new Label("Disconnected");
        statusLabel.setStyle("-fx-font-weight: bold;");

        // Volume control
        HBox volumePanel = new HBox(10);
        volumePanel.setAlignment(Pos.CENTER);
        Label volumeLabel = new Label("Volume:");
        volumeSlider = new Slider(0, 100, 50);
        volumeSlider.setShowTickLabels(true);
        volumeSlider.setShowTickMarks(true);
        volumeSlider.setMajorTickUnit(25);
        volumeSlider.setBlockIncrement(10);
        volumePanel.getChildren().addAll(volumeLabel, volumeSlider);

        // Microphone test
        Button micTestButton = new Button("Test Microphone");
        micTestButton.setOnAction(e -> testMicrophone());

        root.getChildren().addAll(
                new Label("Hytale Voice Chat Client"),
                new Separator(),
                connectionPanel,
                statusLabel,
                new Separator(),
                volumePanel,
                micTestButton
        );

        return new Scene(root, 400, 350);
    }

    private void handleConnect() {
        if (client.isConnected()) {
            client.disconnect();
            connectButton.setText("Connect");
            statusLabel.setText("Disconnected");
            statusLabel.setStyle("-fx-font-weight: bold;");
            usernameField.setDisable(false);
            serverAddressField.setDisable(false);
            serverPortField.setDisable(false);
        } else {
            try {
                String username = usernameField.getText().trim();
                if (username.isEmpty()) {
                    showError("Username cannot be empty");
                    return;
                }
                
                String address = serverAddressField.getText();
                int port = Integer.parseInt(serverPortField.getText());
                
                client.setUsername(username);
                client.connect(address, port);
                
                connectButton.setText("Disconnect");
                statusLabel.setText("Connected as " + username + " to " + address + ":" + port);
                statusLabel.setStyle("-fx-text-fill: green; -fx-font-weight: bold;");
                usernameField.setDisable(true);
                serverAddressField.setDisable(true);
                serverPortField.setDisable(true);
            } catch (NumberFormatException e) {
                showError("Invalid port number");
            } catch (Exception e) {
                showError("Connection failed: " + e.getMessage());
            }
        }
    }

    private void testMicrophone() {
        Alert alert = new Alert(Alert.AlertType.INFORMATION);
        alert.setTitle("Microphone Test");
        alert.setHeaderText("Microphone test feature");
        alert.setContentText("Microphone testing will be implemented here.\nClient ID: " + client.getClientId());
        alert.showAndWait();
    }

    private void showError(String message) {
        Alert alert = new Alert(Alert.AlertType.ERROR);
        alert.setTitle("Error");
        alert.setHeaderText(null);
        alert.setContentText(message);
        alert.showAndWait();
    }

    public static void main(String[] args) {
        launch(args);
    }
}
