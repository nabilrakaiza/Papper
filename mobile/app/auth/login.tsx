import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useAuth } from '../../context/auth';

export default function LoginScreen() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const router = useRouter();
    const { signIn } = useAuth();

    const handleLogin = () => {

        // handle backend here
        if (username == "admin" && password == "123") {
            signIn('admin');
        } else if (username == "cashier" && password == "123") {
            signIn('cashier');
        } else if (username == "waiter" && password == "123") {
            signIn('waiter');
        } else {
            alert("Invalid credentials");
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Papper</Text>
            
            <TextInput
                style={styles.input}
                placeholder="Username"
                value={username}
                onChangeText={setUsername}
                keyboardType="email-address"
                placeholderTextColor="#999"
            />
            
            <TextInput
                style={styles.input}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholderTextColor="#999"
            />
            
            <TouchableOpacity style={styles.button} onPress={handleLogin}>
                <Text style={styles.buttonText}>Sign In</Text>
            </TouchableOpacity>
            
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        padding: 20,
        backgroundColor: '#fff',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 30,
        textAlign: 'center',
    },
    input: {
        borderWidth: 1,
        borderColor: '#ddd',
        padding: 12,
        marginBottom: 15,
        borderRadius: 8,
        fontSize: 16,
    },
    button: {
        backgroundColor: '#007AFF',
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 10,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    footer: {
        textAlign: 'center',
        marginTop: 20,
        color: '#666',
    },
});